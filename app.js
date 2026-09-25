const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const els = {
  clock: document.getElementById("clock"),
  authBtn: document.getElementById("authBtn"),
  hourKicker: document.getElementById("hourKicker"),
  hourTitle: document.getElementById("hourTitle"),
  hourBody: document.getElementById("hourBody"),
  hourStamp: document.getElementById("hourStamp"),
  nextHour: document.getElementById("nextHour"),
  publicNotes: document.getElementById("publicNotes"),
  myNotes: document.getElementById("myNotes"),
  desk: document.getElementById("desk"),
  deskTitle: document.getElementById("deskTitle"),
  noteForm: document.getElementById("noteForm"),
  hourList: document.getElementById("hourList"),
  authModal: document.getElementById("authModal"),
  authForm: document.getElementById("authForm"),
  profileForm: document.getElementById("profileForm"),
  authErr: document.getElementById("authErr"),
  profileErr: document.getElementById("profileErr"),
  signupBtn: document.getElementById("signupBtn"),
};

let session = null;
let profile = null;

function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function tick() {
  const now = new Date();
  els.clock.textContent = fmtTime(now);
  const next = new Date(now);
  next.setMinutes(60, 0, 0);
  const ms = next - now;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  els.nextHour.textContent = `next change in ${m}m ${String(s).padStart(2, "0")}s`;
}

async function loadHour() {
  const { data } = await sb.from("sixtydesk_hours").select("*").order("created_at", { ascending: false }).limit(12);
  const hours = data || [];
  const current = hours[0];
  if (current) {
    els.hourKicker.textContent = current.kicker;
    els.hourTitle.textContent = current.title;
    els.hourBody.textContent = current.body;
    els.hourStamp.textContent = current.hour_key.replace("T", " ");
  }
  els.hourList.innerHTML = hours.map((h, i) => `
    <li style="animation-delay:${i * 40}ms">
      <span>${escapeHtml(h.kicker)} · ${escapeHtml(h.hour_key)}</span>
      <strong>${escapeHtml(h.title)}</strong>
      <p>${escapeHtml(h.body)}</p>
    </li>`).join("") || `<p class="empty">No hours yet.</p>`;
}

async function loadPublic() {
  const { data } = await sb
    .from("sixtydesk_notes")
    .select("id,title,body,created_at,author_id,sixtydesk_profiles(handle,display_name)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(40);
  const notes = data || [];
  if (!notes.length) {
    els.publicNotes.innerHTML = `<p class="empty">The floor is quiet. Sign in and mark a note public.</p>`;
    return;
  }
  els.publicNotes.innerHTML = notes.map((n, i) => {
    const who = n.sixtydesk_profiles?.display_name || n.sixtydesk_profiles?.handle || "someone";
    return `<article class="card" style="animation-delay:${i * 45}ms">
      <h3>${escapeHtml(n.title)}</h3>
      <p>${escapeHtml(n.body)}</p>
      <div class="meta"><span>${escapeHtml(who)}</span><span>${fmtWhen(n.created_at)}</span></div>
    </article>`;
  }).join("");
}

async function loadMine() {
  if (!session) {
    els.myNotes.innerHTML = "";
    return;
  }
  const { data } = await sb
    .from("sixtydesk_notes")
    .select("*")
    .eq("author_id", session.user.id)
    .order("created_at", { ascending: false });
  const notes = data || [];
  if (!notes.length) {
    els.myNotes.innerHTML = `<p class="empty">Nothing on your desk yet.</p>`;
    return;
  }
  els.myNotes.innerHTML = notes.map((n) => `
    <article class="slip">
      <header>
        <strong>${escapeHtml(n.title)}</strong>
        <span>
          <button class="tiny" data-toggle="${n.id}" data-public="${n.is_public}">${n.is_public ? "Make private" : "Mark public"}</button>
          <button class="tiny" data-del="${n.id}">Delete</button>
        </span>
      </header>
      <p>${escapeHtml(n.body)}</p>
      <div class="meta"><span>${n.is_public ? "on the floor" : "private"}</span><span>${fmtWhen(n.created_at)}</span></div>
    </article>`).join("");
}

async function refreshProfile() {
  if (!session) {
    profile = null;
    els.authBtn.textContent = "Sign in";
    els.desk.hidden = true;
    return;
  }
  const { data } = await sb.from("sixtydesk_profiles").select("*").eq("id", session.user.id).maybeSingle();
  profile = data;
  if (!profile) {
    els.authModal.showModal();
    els.authForm.hidden = true;
    els.profileForm.hidden = false;
    document.getElementById("authTitle").textContent = "Name the desk";
    return;
  }
  els.authBtn.textContent = profile.handle;
  els.desk.hidden = false;
  els.deskTitle.textContent = `${profile.display_name}'s desk`;
  await loadMine();
}

async function boot() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  await Promise.all([loadHour(), loadPublic(), refreshProfile()]);
}

els.authBtn.addEventListener("click", async () => {
  if (session) {
    await sb.auth.signOut();
    return;
  }
  els.authForm.hidden = false;
  els.profileForm.hidden = true;
  document.getElementById("authTitle").textContent = "Sign in to the desk";
  els.authModal.showModal();
});

els.signupBtn.addEventListener("click", async () => {
  const fd = new FormData(els.authForm);
  els.authErr.hidden = true;
  const { error } = await sb.auth.signUp({
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (error) {
    els.authErr.hidden = false;
    els.authErr.textContent = error.message;
    return;
  }
  els.authErr.hidden = false;
  els.authErr.textContent = "Account created. If email confirm is on, check your inbox; otherwise sign in.";
});

els.authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(els.authForm);
  els.authErr.hidden = true;
  const { error } = await sb.auth.signInWithPassword({
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (error) {
    els.authErr.hidden = false;
    els.authErr.textContent = error.message;
  }
});

els.profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) return;
  const fd = new FormData(els.profileForm);
  els.profileErr.hidden = true;
  const handle = String(fd.get("handle")).toLowerCase().replace(/[^a-z0-9_]/g, "");
  const { error } = await sb.from("sixtydesk_profiles").upsert({
    id: session.user.id,
    handle,
    display_name: String(fd.get("display_name")).trim(),
    bio: String(fd.get("bio") || "").trim(),
  });
  if (error) {
    els.profileErr.hidden = false;
    els.profileErr.textContent = error.message;
    return;
  }
  els.authModal.close();
  await refreshProfile();
});

els.noteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session || !profile) return;
  const fd = new FormData(els.noteForm);
  const { error } = await sb.from("sixtydesk_notes").insert({
    author_id: session.user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("is_public") === "on",
  });
  if (error) {
    alert(error.message);
    return;
  }
  els.noteForm.reset();
  await Promise.all([loadMine(), loadPublic()]);
});

els.myNotes.addEventListener("click", async (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.toggle) {
    const next = t.dataset.public !== "true";
    await sb.from("sixtydesk_notes").update({ is_public: next }).eq("id", t.dataset.toggle);
    await Promise.all([loadMine(), loadPublic()]);
  }
  if (t.dataset.del) {
    await sb.from("sixtydesk_notes").delete().eq("id", t.dataset.del);
    await Promise.all([loadMine(), loadPublic()]);
  }
});

document.querySelectorAll("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.go)?.scrollIntoView({ behavior: "smooth" });
  });
});

sb.auth.onAuthStateChange((_ev, s) => {
  session = s;
  refreshProfile();
});

setInterval(tick, 1000);
tick();
boot();
setInterval(() => {
  loadHour();
  loadPublic();
}, 60 * 1000);
