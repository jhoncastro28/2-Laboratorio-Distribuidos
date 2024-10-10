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

        // Otras funcionalidades para mostrar peticiones y estadísticas, a trabajarr
    } catch (error) {
        console.error('Error al actualizar la lista de instancias:', error);
    }
});
