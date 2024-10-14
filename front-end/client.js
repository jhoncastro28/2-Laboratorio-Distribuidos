document.getElementById('uploadForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const imageInput = document.getElementById('imageInput');
    const formData = new FormData();
    formData.append('image', imageInput.files[0]); // Añadimos acá la imagen que se haya subido por el usuario :)

    try {
        const response = await fetch('http://localhost:4000/process', { 
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Error en la respuesta del servidor');
        }

        const processedImageUrl = await response.text();
        document.getElementById('responseMessage').innerText = 'Imagen procesada con éxito';
        document.getElementById('processedImage').innerHTML = `<img src="${processedImageUrl}" alt="Imagen Procesada">`;
    } catch (error) {
        document.getElementById('responseMessage').innerText = 'Error al procesar la imagen: ' + error.message;
    }
});