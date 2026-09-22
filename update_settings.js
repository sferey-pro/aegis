const fs = require('fs');
const settingsPath = require('os').homedir() + '/.gemini/antigravity-cli/settings.json';
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

if (!settings.permissions) settings.permissions = {};
if (!settings.permissions.allow) settings.permissions.allow = [];

const newPerms = [
  "command(bun)",
  "command(sed)",
  "command(cat)",
  "command(grep)",
  "command(git add)",
  "command(git checkout)",
  "command(git push)",
  "command(git commit)"
];

for (const p of newPerms) {
  if (!settings.permissions.allow.includes(p)) {
    settings.permissions.allow.push(p);
  }
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
