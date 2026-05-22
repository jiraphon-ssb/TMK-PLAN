import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env variables from .env file
const envPath = '/Users/artist/Downloads/TMK PLAN/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    env[key] = val;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: channels, error } = await supabase.from('tmk_channels').select('*');
  if (error) {
    console.error('Error fetching channels:', error);
    process.exit(1);
  }
  console.log('Channels:', channels);
  const sum = channels.reduce((s, c) => s + Number(c.percentage || 0), 0);
  console.log('Total sum of percentages:', sum);
}

run();
