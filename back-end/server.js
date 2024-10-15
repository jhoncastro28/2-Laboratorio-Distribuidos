require('dotenv').config();
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const cors = require('cors');
const { triggerChaosEngineering } = require('./chaosService');

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
        await axios.post(`${process.env.DISCOVERY_URL}/register`, {
            id: process.env.INSTANCE_ID,
            address: process.env.ADDRESS_IP,
            port: process.env.PORT
        });
        console.log('Instancia registrada en el discovery');
    } catch (error) {
        console.error('Error al registrar instancia en el discovery:', error.message);
    }
};

registerInstance();

app.post('/trigger-chaos', async (req, res) => {
    try {
        await triggerChaosEngineering();
        res.status(200).send('Ingeniería de caos ejecutada con éxito.');
    } catch (error) {
        res.status(500).send('Error al ejecutar ingeniería de caos: ' + error.message);
    }
});

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
    console.log(`Servidor de Back-end escuchando en el puerto ${PORT}`);
});
