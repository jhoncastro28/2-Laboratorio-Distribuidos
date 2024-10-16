require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { exec } = require('child_process');
const Docker = require('dockerode');
const WebSocket = require('ws');

const docker = new Docker();
const app = express();
app.use(cors());
app.use(express.json());

const HEALTH_THRESHOLD = 15000;
const hostIp = process.env.HOST_IP || 'localhost';
const PORT = process.env.PORT || 6000;

let backends = [];
let serverHistory = {};  // Guardará el historial de estado de cada instancia

// Inicializar WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });  // WebSocket en el puerto 8080

// Función para enviar actualizaciones de estado a los clientes WebSocket
const sendStatusToClients = () => {
    const data = JSON.stringify(backends);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

// Registrar instancias backend
app.post('/register', (req, res) => {
    const { id, address, port } = req.body;
    console.log(`Intento de registro: ID=${id}, Address=${address}, Port=${port}`);
    
    const exists = backends.some(backend => backend.id === id);
    if (!exists) {
      backends.push({ 
        id, 
        address: address === 'host.docker.internal' ? 'localhost' : address, 
        port, 
        status: 'unknown', 
        lastCheck: null 
      });
      serverHistory[id] = [];
      console.log(`Backend registrado: ${id} en ${address}:${port}`);
    } else {
      console.log(`Backend ya existente: ${id}. Actualizando información.`);
      const index = backends.findIndex(backend => backend.id === id);
      backends[index] = {
        ...backends[index],
        address: address === 'host.docker.internal' ? 'localhost' : address,
        port
      };
    }
    res.status(200).send('Instancia registrada');
});

// Función para manejar instancias no saludables
async function handleUnhealthyInstance(instance) {
    console.log(`Instance ${instance.id} is unhealthy, removing it and creating a new one...`);
    backends = backends.filter(b => b.id !== instance.id);
    delete serverHistory[instance.id];
  
    const usedPorts = backends.map(b => parseInt(b.port));
    let nextPort = 3004;
    while (usedPorts.includes(nextPort)) nextPort++;
  
    // Ejecuta el comando Docker para crear una nueva instancia
    const command = `docker run -d -p ${nextPort}:3004 -e HOST_PORT=${nextPort} --env-file .env --name backend_instance_${nextPort} mi_backend`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error creating new instance: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
        return;
      }
      console.log(`New instance created on port ${nextPort}`);

      // Registro de la nueva instancia después de la creación
      registerInstance(nextPort);
    });
}

// Función para realizar health checks periódicos
const checkHealth = async () => {
    console.log(`Checking health of ${backends.length} backends`);
    for (let backend of backends) {
      const start = Date.now();
      try {
        const response = await axios.get(`http://${backend.address}:${backend.port}/health`, { 
          timeout: 5000,
        });
        const responseTime = Date.now() - start;
  
        if (response.status === 200 && responseTime <= HEALTH_THRESHOLD) {
          backend.status = 'healthy';
          console.log(`Estado de ${backend.id} (${backend.address}:${backend.port}): healthy (Tiempo de respuesta: ${responseTime}ms)`);
        } else if (responseTime > HEALTH_THRESHOLD) {
          backend.status = 'unhealthy';
          console.log(`Estado de ${backend.id} (${backend.address}:${backend.port}): unhealthy (Tiempo de respuesta excedido: ${responseTime}ms)`);
          await handleUnhealthyInstance(backend);
        }
      } catch (error) {
        backend.status = 'unhealthy';
        console.log(`Estado de ${backend.id} (${backend.address}:${backend.port}): unhealthy (${error.message})`);
        await handleUnhealthyInstance(backend);
      }
  
      backend.lastCheck = new Date().toISOString();

      // Guardar el historial de estado solo si la instancia aún existe en serverHistory
      if (serverHistory[backend.id]) {
        serverHistory[backend.id].push({
          status: backend.status,
          responseTime: Date.now() - start, // Guardar el tiempo de respuesta
          timestamp: backend.lastCheck
        });

        // Limitar el historial a las últimas 50 entradas
        if (serverHistory[backend.id].length > 50) {
          serverHistory[backend.id].shift();
        }
      }
    }

    // Enviar la actualización de estado a los clientes WebSocket
    sendStatusToClients();
};

// Hacer health checks cada 30 segundos
setInterval(checkHealth, 30000);

// Crear una nueva instancia con Docker y registrarla automáticamente
app.post('/create-instance', (req, res) => {
    const port = 3006 + backends.length;

    docker.createContainer({
        Image: 'mi_backend', // Cambiar con el nombre correcto de la imagen
        Tty: true,
        ExposedPorts: { '3000/tcp': {} },
        HostConfig: {
            PortBindings: { '3000/tcp': [{ HostPort: port.toString() }] }
        }
    }, function (err, container) {
        if (err) {
            console.error('Error al crear el contenedor:', err);
            return res.status(500).send('Error al crear instancia');
        }
        container.start((startErr) => {
            if (startErr) {
                console.error('Error al iniciar el contenedor:', startErr);
                return res.status(500).send('Error al iniciar instancia');
            }
            const id = container.id;
            const address = 'localhost'; // O la dirección donde esté el contenedor
            console.log(`Instancia creada y corriendo en el puerto ${port}`);

            // Registrar la nueva instancia después de que está corriendo
            registerInstance(port);

            res.status(200).send('Instancia creada y registrada con éxito');
        });
    });
});

// Función para registrar la instancia en el discovery
const registerInstance = async (port) => {
    try {
        const response = await axios.post(`http://${hostIp}:${PORT}/register`, {
            id: `backend-${port}`,
            address: hostIp,
            port: port
        });
        console.log(`Nueva instancia registrada: backend-${port}`);
    } catch (error) {
        console.error(`Error al registrar la instancia backend-${port}:`, error.message);
    }
};

// Endpoint para obtener el historial de una instancia específica
app.get('/instances/:id/history', (req, res) => {
    const instanceId = req.params.id;
    if (serverHistory[instanceId]) {
        res.json(serverHistory[instanceId]);
    } else {
        res.status(404).send('Instancia no encontrada');
    }
});

// Endpoint para obtener todas las instancias
app.get('/instances', (req, res) => {
    res.json(backends); 
});

app.listen(PORT, () => {
    console.log(`Servicio de Discovery corriendo en el puerto ${PORT}`);
});
