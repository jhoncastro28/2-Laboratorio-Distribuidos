const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let instances = [];

app.use(express.json());

// Función para registrar nuevas instancias
wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        const data = JSON.parse(msg);

        if (data.action === 'register') {
            instances.push({ id: data.id, url: data.url });
            console.log(`Instancia registrada: ${data.id} - ${data.url}`);

            // Enviar instancia al middleware
            fetch('http://localhost:3001/update-instances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'register', instance: { id: data.id, url: data.url } }),
            }).then(response => response.json())
              .then(data => console.log('Instancia registrada en middleware:', data))
              .catch(error => console.error('Error al registrar instancia en middleware:', error));
        }

        if (data.action === 'deregister') {
            instances = instances.filter(inst => inst.id !== data.id);
            console.log(`Instancia eliminada: ${data.id}`);

            // Enviar instancia al middleware
            fetch('http://localhost:3001/update-instances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'deregister', instance: { id: data.id } }),
            }).then(response => response.json())
              .then(data => console.log('Instancia desregistrada en middleware:', data))
              .catch(error => console.error('Error al desregistrar instancia en middleware:', error));
        }

        // Enviar lista actualizada de instancias
        ws.send(JSON.stringify({ type: 'update', instances }));
    });

    // Eliminar instancia si la conexión se cierra
    ws.on('close', () => {
        instances = instances.filter(inst => inst.ws !== ws);
        console.log('Instancia desconectada');
    });
});

// Para asegurarnos de que las instancias estén activas
setInterval(() => {
    instances.forEach((instance, index) => {
        fetch(`${instance.url}/healthcheck`)
            .then(() => console.log(`Instancia ${instance.id} está activa`))
            .catch(() => {
                console.log(`Instancia ${instance.id} no responde. Eliminándola...`);
                instances.splice(index, 1);
            });
    });
}, 60000);

// Ruta para obtener las instancias registradas (para el balanceador)
app.get('/instances', (req, res) => {
    res.json(instances);
});

server.listen(6000, () => {
    console.log('Server Registry corriendo en el puerto 6000');
});
