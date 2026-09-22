const fs = require('fs');

// 1. src/pages/Projects.test.tsx
let f1 = fs.readFileSync('src/pages/Projects.test.tsx', 'utf8');
f1 = f1.replace('as any[]', 'as unknown[]');
fs.writeFileSync('src/pages/Projects.test.tsx', f1);

// 2. src/routes/projects.ts
let f2 = fs.readFileSync('src/routes/projects.ts', 'utf8');
f2 = f2.replace('catch (e: any) {', 'catch (e: unknown) {');
f2 = f2.replace('error: e.message', 'error: (e as Error).message');
fs.writeFileSync('src/routes/projects.ts', f2);

// 3. src/pages/Reports.tsx
let f3 = fs.readFileSync('src/pages/Reports.tsx', 'utf8');
f3 = f3.replace(/projectStats\.get\(d\.projectId\)!\.currentTotal/g, 'projectStats.get(d.projectId)!.currentTotal'); // Wait, replace is exact.

