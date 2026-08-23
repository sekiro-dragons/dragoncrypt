import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const { id } = req.query;
  
  try {
    const secret: any = await redis.get(`secret:${id}`);
    
    if (!secret) {
      return res.status(404).json({ error: 'Secret not found' });
    }
    
    // Destroy the secret permanently if it's burn-after-read
    if (secret.burn_after_read) {
      await redis.del(`secret:${id}`);
    }
    
    return res.status(200).json(secret);
  } catch (error) {
    console.error('Fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch secret' });
  }
}