import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL: invito, isolamento, conferma versamenti e storage privato", async () => {
  const pg = new PGlite();
  try {
    // Local facsimile of Supabase-managed schemas; tests our SQL and RLS, not the live Auth/Storage APIs.
    await pg.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
      grant usage on schema storage to authenticated;
      grant all on storage.objects to authenticated;
    `);
    await pg.exec(
      await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8")
    );
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    const c = "33333333-3333-4333-8333-333333333333";
    await pg.exec(
      `insert into auth.users values ('${a}'),('${b}'),('${c}'); grant usage on schema public to authenticated;`
    );
    async function as(id, fn) {
      await pg.exec(
        `set role authenticated; set request.jwt.claim.sub='${id}';`
      );
      try {
        return await fn();
      } finally {
        await pg.exec("reset role");
      }
    }
    const createProfile = (id) =>
      pg.query(
        `insert into party_records(owner,kind,payload) values($1,'profile',$2)`,
        [
          id,
          {
            name: id,
            status: "yes",
            guests: 0,
            sleep: false,
            allergies: "",
            avoid: "",
          },
        ]
      );
    const join = () =>
      pg.query("select join_party($1)", ["CAMBIA-QUESTO-CODICE-PRIVATO"]);
    await as(a, async () => {
      await assert.rejects(() => pg.query("select join_party($1)", ["errato"]));
      await join();
      await createProfile(a);
    });
    await as(b, async () => {
      assert.equal(
        (await pg.query("select * from party_records")).rows.length,
        0
      );
      await join();
      await createProfile(b);
      assert.equal(
        (await pg.query("select * from party_records")).rows.length,
        2
      );
      assert.equal(
        (
          await pg.query(
            `update party_records set payload=payload||'{"name":"altro"}' where owner=$1 returning id`,
            [a]
          )
        ).rows.length,
        0
      );
      await assert.rejects(() =>
        pg.query(
          `insert into party_records(owner,kind,payload) values($1,'profile',$2)`,
          [a, { name: "Falso" }]
        )
      );
    });
    let transferId;
    await as(a, async () => {
      await pg.query(
        `update party_records set payload=payload||'{"name":"Nome aggiornato"}' where owner=$1`,
        [a]
      );
      const row = await pg.query(
        `insert into party_records(owner,kind,payload) values($1,'transfer',$2) returning id`,
        [a, { from: a, to: b, cents: 100, confirmed: false }]
      );
      transferId = row.rows[0].id;
      await assert.rejects(() =>
        pg.query(
          `update party_records set payload=payload||'{"confirmed":true}' where id=$1`,
          [transferId]
        )
      );
      await assert.rejects(() =>
        pg.query(
          `insert into party_records(owner,kind,payload) values($1,'expense',$2)`,
          [a, { title: "Errore", cents: 100, people: [] }]
        )
      );
    });
    await as(b, async () => {
      await assert.rejects(() =>
        pg.query(
          `update party_records set payload=payload||'{"cents":999}' where id=$1`,
          [transferId]
        )
      );
      await pg.query(
        `update party_records set payload=payload||'{"confirmed":true}' where id=$1`,
        [transferId]
      );
      await assert.rejects(() =>
        pg.query(
          `update party_records set payload=payload||'{"confirmed":false}' where id=$1`,
          [transferId]
        )
      );
    });
    await as(a, async () =>
      assert.equal(
        (
          await pg.query("delete from party_records where id=$1 returning id", [
            transferId,
          ])
        ).rows.length,
        0
      )
    );
    let placeId;
    await as(a, async () => {
      placeId = (
        await pg.query(
          `insert into party_records(owner,kind,payload) values($1,'place',$2) returning id`,
          [
            a,
            {
              title: "Baita",
              description: "Una casa in montagna",
              link: "https://example.com",
              beds: 6,
              cost: 10000,
            },
          ]
        )
      ).rows[0].id;
      await pg.query(
        `insert into party_records(owner,kind,payload) values($1,'vote',$2)`,
        [a, { place: placeId }]
      );
      await assert.rejects(() =>
        pg.query(
          `insert into party_records(owner,kind,payload) values($1,'vote',$2)`,
          [a, { place: placeId }]
        )
      );
      await assert.rejects(() =>
        pg.query(
          `insert into party_records(owner,kind,payload) values($1,'decision',$2)`,
          [a, { place: placeId }]
        )
      );
    });
    await pg.query(
      "update private.party_members set admin=true where user_id=$1",
      [a]
    );
    await as(a, async () => {
      await pg.query(
        `insert into party_records(owner,kind,payload) values($1,'decision',$2)`,
        [a, { place: placeId }]
      );
      await pg.query("delete from party_records where id=$1", [placeId]);
      assert.equal(
        (
          await pg.query(
            `select * from party_records where kind in ('vote','decision')`
          )
        ).rows.length,
        0
      );
      await pg.query(
        `insert into storage.objects(bucket_id,name) values('party-media',$1)`,
        [a + "/test"]
      );
      await assert.rejects(() =>
        pg.query(
          `insert into storage.objects(bucket_id,name) values('party-media',$1)`,
          [b + "/test"]
        )
      );
    });
    await as(c, async () => {
      assert.equal(
        (await pg.query("select * from party_records")).rows.length,
        0
      );
      assert.equal(
        (await pg.query("select * from storage.objects")).rows.length,
        0
      );
      await assert.rejects(() =>
        pg.query(
          `insert into storage.objects(bucket_id,name) values('party-media',$1)`,
          [c + "/test"]
        )
      );
    });
  } finally {
    await pg.close();
  }
});
