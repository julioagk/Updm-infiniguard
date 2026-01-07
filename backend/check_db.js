const db = require('better-sqlite3')('database.db');

console.log('=== SERVICIOS EN BASE DE DATOS LOCAL ===');
const servicios = db.prepare('SELECT id, titulo, estado, estadoCliente, tecnico FROM servicios ORDER BY id').all();

console.log(`\nTotal de servicios: ${servicios.length}\n`);

servicios.forEach(s => {
    console.log(`ID ${s.id}: "${s.titulo}"`);
    console.log(`  Estado: ${s.estado}`);
    console.log(`  EstadoCliente: ${s.estadoCliente || 'null'}`);
    console.log(`  Tecnico: ${s.tecnico || 'sin asignar'}`);
    console.log('');
});

db.close();
