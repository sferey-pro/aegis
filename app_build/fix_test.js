const fs = require('fs');
let content = fs.readFileSync('src/pages/Projects.test.tsx', 'utf8');

content = content.replace(/\/\/ biome-ignore lint\/suspicious\/noExplicitAny: test\n\t\tas any\[\]/g, 'as Record<string, any>[]');
content = content.replace(/as any\[\]/g, 'as Record<string, any>[]');

fs.writeFileSync('src/pages/Projects.test.tsx', content);
