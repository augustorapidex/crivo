import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import {stdin as input,stdout as output} from 'node:process';
const rl=readline.createInterface({input,output});
console.log('Crivo Finance — preparar acesso para a Vercel');
const password=await rl.question('Escolha uma senha com pelo menos 12 caracteres: ');
if(password.length<12) { console.error('Senha muito curta.'); process.exitCode=1; rl.close(); }
else {
  const salt=crypto.randomBytes(16); const hash=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1});
  console.log('\nCopie estas informações para as Variáveis de Ambiente do seu projeto Vercel:\n');
  console.log('AUTH_PASSWORD_HASH=scrypt$'+salt.toString('hex')+'$'+hash.toString('hex'));
  console.log('SESSION_SECRET='+crypto.randomBytes(48).toString('hex'));
  console.log('CRON_SECRET='+crypto.randomBytes(32).toString('hex'));
  console.log('\nApós instalar as dependências, execute também: npx web-push generate-vapid-keys');
  console.log('Cadastre VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (mailto:seu-email).');
  rl.close();
}
