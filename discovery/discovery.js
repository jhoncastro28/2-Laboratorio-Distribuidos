require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { exec } = require('child_process');
const Docker = require('dockerode');
const WebSocket = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

const HEALTH_THRESHOLD = 5000; // Tiempo máximo de respuesta en ms
const hostIp = process.env.HOST_IP || 'localhost';
const PORT = process.env.PORT || 6001;
const docker = new Docker({ socketPath: '/var/run/docker.sock' });


let backends = [];
let serverHistory = {};  // Historial de estado de cada instancia
let requestHistory = {}; // Historial de peticiones de cada instancia
let nextPort = 3006;     // Contador global para puertos

// Inicializar WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });

// Función para enviar actualizaciones de estado a los clientes WebSocket
const sendStatusToClients = () => {
    const message = {
        type: 'serverStatus',
        data: backends
    };
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

// Función para crear una nueva instancia
const createNewInstance = (instanceId) => {
    const port = nextPort++;
    const containerName = instanceId || `backend-${port}`;

    const dockerCommand = `docker run -d -p ${port}:${port} -e HOST_PORT=${port} --env-file .env --name ${containerName} mi_backend`;

    exec(dockerCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('Error al crear el contenedor:', error);
            return;
        }
        console.log(`Instancia creada: ${stdout.trim()}`);
        console.log(`Instancia creada y corriendo en el puerto ${port}`);

        // Registrar la nueva instancia después de que está corriendo
        registerInstance(port, containerName);
    });
};
async function triggerChaosEngineering() {
    if (backends.length === 0) {
        console.log('No hay instancias disponibles para aplicar ingeniería de caos.');
        return;
    }

    // Seleccionar una instancia saludable aleatoria
    const healthyInstances = backends.filter(instance => instance.status === 'healthy');
    if (healthyInstances.length === 0) {
        console.log('No hay instancias saludables disponibles para aplicar ingeniería de caos.');
        return;
    }

    const randomIndex = Math.floor(Math.random() * healthyInstances.length);
    const instance = healthyInstances[randomIndex];

    console.log(`Aplicando ingeniería de caos a la instancia: ${instance.id}`);

    // Detener y eliminar el contenedor Docker
    try {
        // Utiliza instance.containerName
        const container = docker.getContainer(instance.containerName);
        await container.stop();
        await container.remove();

        console.log(`Contenedor ${instance.containerName} detenido y eliminado.`);
    } catch (error) {
        console.error(`Error al detener/eliminar el contenedor ${instance.containerName}:`, error);
    }
}

// Endpoint para desencadenar ingeniería de caos
app.post('/trigger-chaos', async (req, res) => {
    try {
        await triggerChaosEngineering();
        res.status(200).send('Ingeniería de caos ejecutada con éxito.');
    } catch (error) {
        console.error('Error al ejecutar ingeniería de caos:', error);
        res.status(500).send('Error al ejecutar ingeniería de caos.');
    }
});

// Función para registrar la instancia en el discovery
const registerInstance = async (port, containerName) => {
    try {
        await axios.post(`http://${hostIp}:${PORT}/register`, {
            id: containerName,
            address: hostIp,
            port: port,
            containerName: containerName
        });
        console.log(`Nueva instancia registrada: ${containerName}`);
    } catch (error) {
        console.error(`Error al registrar la instancia ${containerName}:`, error.message);
    }
};

// Registrar instancias backend
app.post('/register', (req, res) => {
    const { id, address, port, containerName } = req.body;
    console.log(`Intento de registro: ID=${id}, Address=${address}, Port=${port}`);
    
    const exists = backends.some(backend => backend.id === id);
    if (!exists) {
        backends.push({ 
            id, 
            address: address === 'host.docker.internal' ? 'localhost' : address, 
            port, 
            status: 'unknown', 
            lastCheck: null,
            containerName
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
            port,
            containerName
        };
    }
    res.status(200).send('Instancia registrada');
});

// Función para manejar instancias no saludables
async function handleUnhealthyInstance(instance) {
    console.log(`Instance ${instance.id} is unhealthy`);

    // Encontrar el índice de la instancia
    const index = backends.findIndex(b => b.id === instance.id);
    if (index !== -1) {
        // Eliminar la instancia de la lista de backends
        backends.splice(index, 1);
    }

    console.log(`Removed instance ${instance.id} from backends`);

    // Lanzar una nueva instancia
    createNewInstance();
}


// Función para realizar health checks periódicos
const checkHealth = async () => {
    console.log(`Checking health of ${backends.length} backends`);
    for (let backend of backends) {
        const start = Date.now();
        try {
            const response = await axios.get(`http://${backend.address}:${backend.port}/health`, { 
                timeout: HEALTH_THRESHOLD,
            });
            const responseTime = Date.now() - start;

            if (response.status === 200 && responseTime <= HEALTH_THRESHOLD) {
                backend.status = 'healthy';
                console.log(`Estado de ${backend.id} (${backend.address}:${backend.port}): healthy (Tiempo de respuesta: ${responseTime}ms)`);
            } else {
                throw new Error('Unhealthy response');
            }

            backend.lastCheck = new Date().toISOString();

            // Guardar el historial de estado
            if (!serverHistory[backend.id]) {
                serverHistory[backend.id] = [];
            }
            serverHistory[backend.id].push({
                status: backend.status,
                responseTime: responseTime,
                timestamp: backend.lastCheck
            });

            // Limitar el historial a las últimas 50 entradas
            if (serverHistory[backend.id].length > 50) {
                serverHistory[backend.id].shift();
            }

            // Enviar actualización del historial a los clientes
            sendInstanceHistoryUpdate(backend.id);
        } catch (error) {
            console.log(`Estado de ${backend.id} (${backend.address}:${backend.port}): unhealthy (${error.message})`);
            await handleUnhealthyInstance(backend);
        }
    }

    // Enviar la actualización de estado a los clientes WebSocket
    sendStatusToClients();
};

// Función para enviar actualizaciones de historial de instancia a los clientes WebSocket
const sendInstanceHistoryUpdate = (instanceId) => {
    const message = {
        type: 'instanceHistoryUpdate',
        instanceId: instanceId,
        history: serverHistory[instanceId]
    };
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

// Hacer health checks cada 30 segundos
setInterval(checkHealth, 30000);

// Endpoint para crear una nueva instancia manualmente
app.post('/create-instance', (req, res) => {
    createNewInstance();
    res.status(200).send('Instancia creada y registrada con éxito');
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

// Endpoint para obtener el historial de peticiones de una instancia específica
app.get('/instances/:id/requests', (req, res) => {
    const instanceId = req.params.id;
    console.log(`Solicitando historial de peticiones para la instancia: ${instanceId}`);
    
    if (requestHistory[instanceId] && requestHistory[instanceId].length > 0) {
        console.log(`Historial encontrado. Número de peticiones: ${requestHistory[instanceId].length}`);
        res.json(requestHistory[instanceId]);
    } else {
        console.log(`No se encontró historial para la instancia: ${instanceId}`);
        res.json([]); // Enviamos un array vacío en lugar de un 404
    }
});

// Endpoint para registrar una nueva petición para una instancia
app.post('/instances/:id/requests', express.json(), (req, res) => {
    const instanceId = req.params.id;
    const newRequest = req.body;
    
    if (!requestHistory[instanceId]) {
        requestHistory[instanceId] = [];
    }
    
    const requestEntry = {
        ...newRequest,
        date: new Date().toISOString()
    };

    requestHistory[instanceId].push(requestEntry);

    // Limitar el historial de peticiones a las últimas 100 entradas
    if (requestHistory[instanceId].length > 100) {
        requestHistory[instanceId].shift();
    }
    
    console.log(`Nueva petición registrada para la instancia ${instanceId}`);

    // Enviar notificación por WebSocket
    const message = {
        type: 'newRequest',
        instanceId: instanceId,
        request: requestEntry
    };
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
    
    res.status(201).json({ message: 'Petición registrada con éxito' });
});

// Endpoint para obtener todas las instancias
app.get('/instances', (req, res) => {
    res.json(backends); 
});

app.listen(PORT, () => {
    console.log(`Servicio de Discovery corriendo en el puerto ${PORT}`);
});
