import { Button } from "@/components/ui";

export default function ShareNotFound() {
  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "2rem" }}>
    <section style={{ maxWidth: "34rem", padding: "2rem", borderRadius: "1rem", background: "var(--paper)", color: "var(--ink)", textAlign: "center" }}><h1>This shared plot isn’t available</h1><p>You can still explore Indie Hackers City.</p>
      <Button as="a" href="/">Explore the city</Button>
    </section>
  </main>;
}
