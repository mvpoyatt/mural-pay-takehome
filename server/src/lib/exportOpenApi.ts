// Run with: npx ts-node src/lib/exportOpenApi.ts
// Writes openapi.json to the repo root
import fs from 'fs';
import path from 'path';
import { swaggerSpec } from './openapi';

const outPath = path.join(__dirname, '../../../openapi.json');
fs.writeFileSync(outPath, JSON.stringify(swaggerSpec, null, 2));
console.log(`OpenAPI spec written to ${outPath}`);
