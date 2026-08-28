# Deploying the DXB platform

The platform is a static site — HTML, CSS and JS with no build step — so the
image is nginx plus the files. Two URLs are exposed from one container:

| URL      | Surface                          | Sign-in                       |
|----------|----------------------------------|-------------------------------|
| `/`      | Passenger site                   | Passenger account             |
| `/admin` | Operations Control Center        | Staff account                 |

The two sign-ins are independent: they are stored under separate keys, so being
signed in to one never signs you in to the other. A staff member can browse the
passenger site as an ordinary visitor at the same time.

## Demo accounts

| Surface  | Email                | Password |
|----------|----------------------|----------|
| Passenger| passenger@emirates.com | passenger |
| Admin    | admin@dxb.gov.ae     | admin    |

These are seeded into the browser on first load. They are demo credentials for a
prototype and protect nothing — do not reuse them anywhere real.

## Run it locally

```bash
docker build -t dxb-platform .
docker run --rm -p 8080:80 dxb-platform
```

Then open http://localhost:8080 for the passenger site and
http://localhost:8080/admin for the OCC.

## Deploy on Hamravesh

The app listens on port **80** and needs no environment variables, no database
and no persistent volume — all demo state lives in the visitor's own browser.

1. Create a new app and point it at this Git repository.
2. Choose **Dockerfile** as the build method; the `Dockerfile` at the repo root
   is picked up automatically.
3. Set the container port to **80**.
4. Deploy, then attach the domain Hamravesh gives you.

Both URLs come from the same domain: `https://<your-domain>/` for passengers and
`https://<your-domain>/admin` for the OCC.

## A note on state

Bookings, sessions and check-ins are kept in the visitor's browser
(`localStorage`), not on a server. Two different visitors therefore see two
different sets of data, and clearing site data resets the demo. That is fine for
a prototype; a real deployment would need an API and a database behind it.
