// Cloudflare Worker: forwards ONLY Akasha's calculations endpoint.
// Deploy: dash.cloudflare.com -> Workers & Pages -> Create Worker ->
// paste this -> Deploy -> copy the workers.dev URL into Wispbyte env as AKASHA_PROXY.
export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/getCalculationsForUser/")) {
      return new Response("not allowed", { status: 403 });
    }
    const upstream = await fetch("https://akasha.cv" + url.pathname + url.search, {
      headers: {
        "User-Agent": "akasha-py",
        "Accept": "application/json",
        "Referer": "https://akasha.cv/"
      }
    });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" }
    });
  }
};
