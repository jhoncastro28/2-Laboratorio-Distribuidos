const express = require('express');
const axios = require('axios');
const cors = require('cors');

const { exec } = require('child_process');
const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const WebSocket = require('ws');


const app = express();
app.use(cors()); 
app.use(express.json());

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

    const exists = backends.some(backend => backend.id === id);
    if (!exists) {
        backends.push({ id, address, port, status: 'unknown', lastCheck: null });
        serverHistory[id] = [];  // Inicializa el historial de esta instancia
        console.log(`Backend registrado: ${id} en ${address}:${port}`);
    }
    res.status(200).send('Instancia registrada');
});

// Obtener instancias
app.get('/instances', (req, res) => {
    res.json(backends);
});

// Función para realizar health checks periódicos
const checkHealth = async () => {
    for (let backend of backends) {
        try {
            const response = await axios.get(`http://${backend.address}:${backend.port}/health`);
            backend.status = response.status === 200 ? 'healthy' : 'unhealthy';
        } catch (error) {
            backend.status = 'unhealthy';
        }
        backend.lastCheck = new Date().toISOString();

        // Guardar el historial de estado
        serverHistory[backend.id].push({
            status: backend.status,
            timestamp: backend.lastCheck
        });

        // Limitar el historial a las últimas 50 entradas
        if (serverHistory[backend.id].length > 50) {
            serverHistory[backend.id].shift();
        }
        console.log(`Estado de ${backend.id}: ${backend.status}`);
    }

    // Enviar la actualización de estado a los clientes WebSocket
    sendStatusToClients();
};

// Hacer health checks cada 30 segundos
setInterval(checkHealth, 30000);

// Crear una nueva instancia con Docker y registrarla automáticamente
app.post('/create-instance', (req, res) => {
    const port = 3000 + backends.length;

    docker.createContainer({
        Image: 'nombre_imagen_backend', // Cambiar con el nombre correcto de la imagen
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

            // Registrar la nueva instancia
            backends.push({ id, address, port, status: 'healthy', lastCheck: new Date().toISOString() });
            res.status(200).send('Instancia creada y registrada con éxito');
        });
    });
});

// Endpoint para obtener el historial de una instancia específica
app.get('/instances/:id/history', (req, res) => {
    const instanceId = req.params.id;
    if (serverHistory[instanceId]) {
        res.json(serverHistory[instanceId]);
    } else {
        res.status(404).send('Instancia no encontrada');
    }
});

const PORT = process.env.PORT || 6000;
app.listen(PORT, () => {
    console.log(`Servicio de Discovery corriendo en el puerto ${PORT}`);
});