require('dotenv').config();
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const cors = require('cors');

const { addWatermark } = require('./watermarkService');

const app = express();
app.use(cors()); 
const upload = multer({ storage: multer.memoryStorage() });

app.post('/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No se recibió ninguna imagen');
        }

        const processedImageBuffer = await addWatermark(req.file.buffer);
        
        res.setHeader('Content-Type', 'image/png');
        res.send(processedImageBuffer);
    } catch (error) {
        console.error('Error al procesar la imagen:', error);
        res.status(500).send('Error al procesar la imagen');
    }
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const registerInstance = async () => {
    try {
        const hostPort = process.env.HOST_PORT || 3004;
        const instanceId = `backend-${hostPort}`; 
        await axios.post(`${process.env.DISCOVERY_URL}/register`, {
            id: instanceId,
            address: process.env.ADDRESS_IP,
            port: hostPort
        });
        console.log(`Instancia registrada en el discovery con ID ${instanceId} y puerto ${hostPort}`);
    } catch (error) {
        console.error('Error al registrar instancia en el discovery:', error.message);
    }
};

registerInstance();

const PORT = process.env.HOST_PORT || 3004;
app.listen(PORT, () => {
    console.log(`Servidor de Back-end escuchando en el puerto ${PORT}`);
});
