// Función para actualizar la lista de instancias activas
function updateInstancesList() {
    fetch('http://localhost:4000/instances')  // Endpoint que devuelve la lista de instancias activas
    .then(response => response.json())
    .then(data => {
        const instancesList = document.getElementById('instancesList');
        instancesList.innerHTML = '';

        data.forEach(instance => {
            const listItem = document.createElement('li');
            listItem.textContent = `Instancia ID: ${instance.id}`;
            instancesList.appendChild(listItem);
        });
    })
    .catch(error => {
        console.error('Error al obtener la lista de instancias:', error);
    });
}

// Crear nueva instancia y actualizar la lista
document.getElementById('createInstanceBtn').addEventListener('click', () => {
    fetch('http://localhost:4000/create-instance', {
        method: 'POST',
    })
    .then(response => response.text())
    .then(data => {
        alert(`Instancia creada: ${data}`);
        updateInstancesList();
    })
    .catch(error => {
        console.error('Error al crear la instancia:', error);
    });
});

// Actualizar la lista de instancias al cargar la página
updateInstancesList();

// Función para actualizar la tabla de servidores
document.getElementById('refresh-btn').addEventListener('click', async function() {
    try {
        const response = await fetch('http://localhost:3001/instances');
        const instances = await response.json();

        // Actualizar la tabla de servidores
        const tableBody = document.getElementById('servers-body');
        tableBody.innerHTML = '';

        instances.forEach(instance => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${instance.id}</td>
                <td>Activo</td>
                <td>${new Date().toLocaleString()}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error al actualizar la lista de servidores:', error);
    }
});