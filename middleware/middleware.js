require('dotenv').config();
const express = require('express');
const axios = require('axios');
const multer = require('multer'); // Para recibir la imagen desde el cliente
const FormData = require('form-data');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 4000;

const upload = multer({ storage: multer.memoryStorage() });

let instances = [];
let currentIndex = 0;

async function fetchInstances() {
    try {
      const response = await axios.get(`${process.env.DISCOVERY_URL}/instances`);
      instances = response.data
        .filter(instance => instance.status === 'healthy')
        .map(instance => ({
          id: instance.id,
          url: `http://${instance.address}:${instance.port}`
        }));
      console.log('Todas las instancias:', response.data);
      console.log('Instancias saludables actualizadas:', instances);
    } catch (error) {
      console.error('Error al obtener instancias del discovery:', error.message);
    }
  }
  


fetchInstances();
setInterval(fetchInstances, 30000);

app.post('/process', upload.single('image'), async (req, res) => {
    if (instances.length === 0) {
        return res.status(500).send('No hay instancias disponibles.');
    }

    const totalInstances = instances.length;
    let attempts = 0;
    let success = false;

    while (attempts < totalInstances && !success) {
        const instance = instances[currentIndex];
        currentIndex = (currentIndex + 1) % totalInstances;
        attempts++;

        try {
            const formData = new FormData();
            formData.append('image', req.file.buffer, { filename: req.file.originalname });

            // Enviar la imagen a la instancia seleccionada
            const response = await axios.post(`${instance.url}/process`, formData, {
                headers: {
                    ...formData.getHeaders()
                },
                responseType: 'arraybuffer',
                timeout: 5000
            });

            const contentType = response.headers['content-type'];
            res.setHeader('Content-Type', contentType);
            return res.status(response.status).send(Buffer.from(response.data));
        } catch (error) {
            console.log(`Error en la instancia ${instance.id}: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
        }
    }

    return res.status(500).send('No se pudo procesar la solicitud. Todas las instancias fallaron.');
});

app.post('/trigger-chaos', async (req, res) => {
    try {
        // Ejecutar el caos desde el Middleware
        await triggerChaosEngineering();
        res.status(200).send('Ingeniería de caos ejecutada con éxito.');
    } catch (error) {
        console.error('Error al ejecutar ingeniería de caos:', error.message);
        res.status(500).send('Error al ejecutar ingeniería de caos: ' + error.message);
    }
});

app.listen(PORT, () => {
    console.log(`Middleware corriendo en el puerto ${PORT}`);
});
