const fs = require('fs');
let content = fs.readFileSync('app_build/src/pages/Projects.tsx', 'utf8');

content = content.replace('{!editingId && (', '{true && (');
content = content.replace('{editingId\n\t\t\t\t\t\t\t\t\t\t\t\t? "Modifier le Projet"\n\t\t\t\t\t\t\t\t\t\t\t\t: formData.source_type === "local"', '{formData.source_type === "local"');
content = content.replace('{editingId && (', '{false && (');
content = content.replace('{!editingId && !formData.is_remote && (', '{!formData.is_remote && (');
content = content.replace('{formData.is_remote && !editingId && (', '{formData.is_remote && (');
content = content.replace('{(!formData.is_remote || editingId) && (', '{(!formData.is_remote) && (');
content = content.replace('{editingId ? "Enregistrer" : "Créer sans auditer"}', '{"Créer sans auditer"}');

fs.writeFileSync('app_build/src/pages/Projects.tsx', content);
