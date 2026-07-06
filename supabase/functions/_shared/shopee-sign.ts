// Assinatura HMAC-SHA256 exigida em toda chamada à Shopee Open Platform v2.
// Isto SÓ pode rodar no servidor: exige o partner_key (secret), que nunca
// deve chegar ao navegador. Formato confirmado na documentação/exemplos
// oficiais da Shopee: sign = hex(HMAC_SHA256(partner_key, base_string)).
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
