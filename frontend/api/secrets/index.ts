import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const id = crypto.randomUUID();
    const payload = { id, ...req.body, created_at: new Date().toISOString() };
    
    // Calculate expiration in seconds for Redis
    let ex = 604800; // default to 7 days
    if (req.body.expires_at) {
      const seconds = Math.floor((new Date(req.body.expires_at).getTime() - Date.now()) / 1000);
      if (seconds > 0) ex = seconds;
    }

    // Save encrypted blob to Upstash
    await redis.set(`secret:${id}`, payload, { ex });
    
    return res.status(200).json({ id });
  } catch (error) {
    console.error('Save error:', error);
    return res.status(500).json({ error: 'Failed to save secret' });
  }
}