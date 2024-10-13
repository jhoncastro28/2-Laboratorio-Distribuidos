const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let backends = [];

app.post('/register', (req, res) => {
    const { id, address, port } = req.body;

    const exists = backends.some(backend => backend.id === id);
    if (!exists) {
        backends.push({ id, address, port, status: 'unknown', lastCheck: null });
        console.log(`Backend registrado: ${id} en ${address}:${port}`);
    }
    res.status(200).send('Instancia registrada');
});

app.get('/instances', (req, res) => {
    res.json(backends);
});

const checkHealth = async () => {
    for (let backend of backends) {
        try {
            const response = await axios.get(`http://${backend.address}:${backend.port}/health`);
            backend.status = response.status === 200 ? 'healthy' : 'unhealthy';
        } catch (error) {
            backend.status = 'unhealthy';
        }
        backend.lastCheck = new Date().toISOString();
        console.log(`Estado de ${backend.id}: ${backend.status}`);
    }
};

setInterval(checkHealth, 30000);

const PORT = process.env.PORT || 6000;
app.listen(PORT, () => {
    console.log(`Servicio de Discovery corriendo en el puerto ${PORT}`);
});
