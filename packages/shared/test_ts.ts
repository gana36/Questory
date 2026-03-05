import * as fs from 'fs';
import { SessionSchema } from './src/session';

try {
    const data = JSON.parse(fs.readFileSync('./fixtures/sample_session.json', 'utf-8'));
    const session = SessionSchema.parse(data);
    console.log("Zod validation passed! Session ID:", session.id);
} catch (e) {
    console.error("Zod validation failed:", e);
    process.exit(1);
}
