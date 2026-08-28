# Deploying the DXB platform

## This is a separate app from bamap — keep it that way

`bamap.darkube.ir` is a different project. It is a Next.js app that already owns
`/admin` and `/grow`, both behind its own HTTP Basic authentication, plus a set
of `/api/*` routes. **Do not deploy this platform under the bamap domain.** If
these two ever shared a domain, the paths would collide and bamap's admin panel
would be the thing that breaks.

Deploy this as its **own Darkube app with its own subdomain**, for example
`dxb.darkube.ir`. The two apps then share nothing: separate containers, separate
domains, separate storage. Nothing in this repository can reach bamap.

To reduce the chance of confusion even further, the operations panel here lives
at `/occ`, not `/admin`.

## What gets deployed

The platform is a static site — HTML, CSS and JS with no build step — so the
image is nginx plus the files. One container serves two entry URLs:

| URL    | Surface                   | Sign-in           |
|--------|---------------------------|-------------------|
| `/`    | Passenger site            | Passenger account |
| `/occ` | Operations Control Center | Staff account     |

The two sign-ins are independent: they are stored under separate keys, so being
signed in to one never signs you in to the other. A staff member can browse the
passenger site as an ordinary visitor at the same time.

## Demo accounts

| Surface   | Email                  | Password  |
|-----------|------------------------|-----------|
| Passenger | passenger@emirates.com | passenger |
| Operations| admin@dxb.gov.ae       | admin     |

These are seeded into the browser on first load. They are demo credentials for a
prototype and protect nothing — do not reuse them anywhere real, and do not put
anything sensitive behind them.

## Run it locally

```bash
docker build -t dxb-platform .
```

```bash
docker run --rm -p 8080:80 dxb-platform
```

Then open http://localhost:8080 for the passenger site and
http://localhost:8080/occ for the operations panel.

## Deploy on Darkube / Hamravesh

The app listens on port **80** and needs no environment variables, no database
and no persistent volume — all demo state lives in the visitor's own browser.

1. Create a **new** app. Do not add this to the existing bamap app.
2. Point it at this Git repository and pick the branch you want to publish.
3. Choose **Dockerfile** as the build method; the `Dockerfile` at the repo root
   is picked up automatically.
4. Set the container port to **80**.
5. Deploy, then attach a subdomain of its own.

Both URLs then come from that one new domain: `https://<your-subdomain>/` for
passengers and `https://<your-subdomain>/occ` for operations.

## A note on state

Bookings, sessions and check-ins are kept in the visitor's browser
(`localStorage`), not on a server. Two different visitors therefore see two
different sets of data, and clearing site data resets the demo. That is fine for
a prototype; a real deployment would need an API and a database behind it.
