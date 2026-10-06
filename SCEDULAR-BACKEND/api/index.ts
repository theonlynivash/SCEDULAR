// Vercel entry point of the API project (Root Directory = SCEDULAR-BACKEND).
// The whole Express app runs as one serverless function; vercel.json sends every request to it.
// Settings come from the project's Environment Variables, not from a .env file.
import 'dotenv/config'
import { app } from '../src/app.js'

export default app
