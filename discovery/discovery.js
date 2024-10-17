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
const PORT = process.env.PORT || 6001;

let backends = [];
let serverHistory = {};  // Guardará el historial de estado de cada instancia
let requestHistory = {}; // Guardará el historial de peticiones de cada instancia

// Inicializar WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });

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
        requestHistory[id] = []; // Inicializar el historial de peticiones para la nueva instancia
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
  console.log(`Instance ${instance.id} is unhealthy`);
  
  // En lugar de eliminar la instancia, simplemente actualizamos su estado
  const index = backends.findIndex(b => b.id === instance.id);
  if (index !== -1) {
      backends[index].status = 'unhealthy';
      backends[index].lastCheck = new Date().toISOString();
      
      // Agregar esta entrada al historial
      if (!serverHistory[instance.id]) {
          serverHistory[instance.id] = [];
      }
      serverHistory[instance.id].push({
          status: 'unhealthy',
          timestamp: backends[index].lastCheck,
          responseTime: HEALTH_THRESHOLD // Asumimos el peor caso
      });
      
      // Limitar el historial a las últimas 50 entradas
      if (serverHistory[instance.id].length > 50) {
          serverHistory[instance.id].shift();
      }
  }
  
  // No creamos una nueva instancia aquí
  console.log(`Updated status of instance ${instance.id} to unhealthy`);
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
            } else {
                throw new Error('Unhealthy response');
            }
        } catch (error) {
            backend.status = 'unhealthy';
            console.log(`Estado de ${backend.id} (${backend.address}:${backend.port}): unhealthy (${error.message})`);
            await handleUnhealthyInstance(backend);
        }

      backend.lastCheck = new Date().toISOString();

      // Guardar el historial de estado
      if (!serverHistory[backend.id]) {
          serverHistory[backend.id] = [];
      }
      serverHistory[backend.id].push({
          status: backend.status,
          responseTime: Date.now() - start,
          timestamp: backend.lastCheck
      });

      // Limitar el historial a las últimas 50 entradas
      if (serverHistory[backend.id].length > 50) {
          serverHistory[backend.id].shift();
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
    const containerName = `backend_instance_${backends.length + 1}`;

    const dockerCommand = `docker run -d -p ${port}:${port} -e HOST_PORT=${port} --env-file .env --name ${containerName} mi_backend`;


    exec(dockerCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Error al crear el contenedor:', error);
            return res.status(500).send('Error al crear instancia');
        }
        console.log(`Instancia creada: ${stdout.trim()}`);
        console.log(`Instancia creada y corriendo en el puerto ${port}`);

        // Registrar la nueva instancia después de que está corriendo
        registerInstance(port);

        res.status(200).send('Instancia creada y registrada con éxito');
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

// Endpoint para obtener el historial de peticiones de una instancia específica
app.get('/instances/:id/requests', (req, res) => {
    const instanceId = req.params.id;
    console.log(`Solicitando historial de peticiones para la instancia: ${instanceId}`);
    
    if (requestHistory[instanceId]) {
        console.log(`Historial encontrado. Número de peticiones: ${requestHistory[instanceId].length}`);
        res.json(requestHistory[instanceId]);
    } else {
        console.log(`No se encontró historial para la instancia: ${instanceId}`);
        res.status(404).json({ message: 'Historial de peticiones no encontrado para esta instancia' });
    }
});

// Endpoint para registrar una nueva petición para una instancia específica
app.post('/instances/:id/requests', (req, res) => {
    const instanceId = req.params.id;
    const { type, payload, response, url } = req.body;
  
    if (!requestHistory[instanceId]) {
        requestHistory[instanceId] = [];
    }
  
    const newRequest = {
        type,
        payload,
        date: new Date().toISOString(),
        response,
        url
    };
  
    requestHistory[instanceId].push(newRequest);
  
    // Limitar el historial a las últimas 50 entradas
    if (requestHistory[instanceId].length > 50) {
        requestHistory[instanceId].shift();
    }
  
    res.status(200).send('Petición registrada con éxito');
});


// Endpoint para obtener todas las instancias
app.get('/instances', (req, res) => {
    res.json(backends); 
});

app.listen(PORT, () => {
    console.log(`Servicio de Discovery corriendo en el puerto ${PORT}`);
});