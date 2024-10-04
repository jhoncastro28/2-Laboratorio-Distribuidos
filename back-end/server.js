const express = require('express');
const multer = require('multer');
const { addWatermark } = require('./watermarkService');

const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // Con esto se guardan las imágenes obtenidas en memoria

app.post('/process', upload.single('image'), async (req, res) => {
    try {
        const processedImageBuffer = await addWatermark(req.file.buffer);
        res.type('image/png'); // Este se supone que es el tipo del contenido de la imagen
        res.send(processedImageBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error al procesar la imagen');
    }
});

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
    console.log(`Servidor de Back-end escuchando en el puerto ${PORT}`);
});