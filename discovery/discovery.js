const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let instances = [];

// Función para registrar nuevas instancias
wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        const data = JSON.parse(msg);

        if (data.action === 'register') {
            instances.push({ id: data.id, url: data.url });
            console.log(`Instancia registrada: ${data.id} - ${data.url}`);
        }

        if (data.action === 'deregister') {
            instances = instances.filter(inst => inst.id !== data.id);
            console.log(`Instancia eliminada: ${data.id}`);
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

// Ruta para obtener las instancias registradas (para el balanceador)
app.get('/instances', (req, res) => {
    res.json(instances);
});

server.listen(6000, () => {
    console.log('Server Registry corriendo en el puerto 6000');
});
