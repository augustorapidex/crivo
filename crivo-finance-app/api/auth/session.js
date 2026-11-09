import {isAuthenticated} from '../../lib/server.js';
export default async function handler(req,res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.status(200).json({ authenticated: await isAuthenticated(req) });
}
