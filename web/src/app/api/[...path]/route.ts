const WORKER_BASE_URL =
  'https://afiliado-auto-api.thompsonpaixao.workers.dev';

export const dynamic = 'force-dynamic';

async function proxy(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const incomingUrl = new URL(request.url);
  const path = params.path.join('/');
  const targetUrl =
    `${WORKER_BASE_URL}/api/${path}${incomingUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('connection');

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-length');
  responseHeaders.delete('content-encoding');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
