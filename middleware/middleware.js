const express = require('express');
const axios = require('axios');
const multer = require('multer'); // Para recibir la imagen desde el cliente
const FormData = require('form-data'); // Para enviar el archivo como multipart/form-data

const app = express();

// Configuración para recibir archivos de imagen
const upload = multer({ storage: multer.memoryStorage() });

let instances = [];
let currentIndex = 0;

// Función para obtener las instancias registradas en el servicio de Discovery
async function fetchInstances() {
    try {
        const response = await axios.get('http://localhost:6000/instances'); // URL del servicio de descubrimiento
        instances = response.data
            .filter(instance => instance.status === 'healthy') // Solo instancias saludables
            .map(instance => ({
                id: instance.id,
                url: `http://${instance.address}:${instance.port}`
            }));
        console.log('Instancias saludables actualizadas:', instances);
    } catch (error) {
        console.error('Error al obtener instancias del discovery:', error.message);
    }
}

// Inicializar las instancias cuando arranca el middleware
fetchInstances();
setInterval(fetchInstances, 60000); // Actualizar instancias cada 60 segundos

// Endpoint para procesar la imagen
app.post('/process', upload.single('image'), async (req, res) => {
    if (instances.length === 0) {
        return res.status(500).send('No hay instancias disponibles.');
    }

    const totalInstances = instances.length;
    let attempts = 0;
    let success = false;

    // Intentar con varias instancias
    while (attempts < totalInstances && !success) {
        const instance = instances[currentIndex];
        currentIndex = (currentIndex + 1) % totalInstances;
        attempts++;

        try {
            const formData = new FormData();
            formData.append('image', req.file.buffer, { filename: req.file.originalname }); // Agregar la imagen al FormData

            // Enviar la solicitud al backend
            const response = await axios.post(`${instance.url}/process`, formData, {
                headers: {
                    ...formData.getHeaders() // Establecer los encabezados de multipart/form-data
                }
            });
            return res.status(response.status).send(response.data); // Respuesta exitosa
        } catch (error) {
            console.log(`Error en la instancia ${instance.id}: ${error.message}`);
            continue; // Intentar con la siguiente instancia si falla
        }
    }

    return res.status(500).send('No se pudo procesar la solicitud. Todas las instancias fallaron.');
});

// Iniciar el middleware
const port = 4000;
app.listen(port, () => {
    console.log(`Middleware corriendo en el puerto ${port}`);
});
