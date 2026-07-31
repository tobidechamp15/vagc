export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 40 }}>
      <h1>Church Member Management API</h1>
      <p>Backend is running. Available endpoints:</p>
      <ul>
        <li>GET/POST /api/members</li>
        <li>GET/PUT/DELETE /api/members/:id</li>
        <li>GET /api/birthdays/today</li>
        <li>GET /api/cron/birthday-check (protected, called by Vercel Cron)</li>
      </ul>
    </main>
  );
}
