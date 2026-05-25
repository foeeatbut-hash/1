async function main() {
  const p = await fetch("http://0.0.0.0:3000/api/projects/b7bba5f4-a0ec-4cce-b39d-0136300707d6/dictionaries");
  console.log("Status:", p.status);
  const text = await p.text();
  console.log("Body:", text);
}

main().catch(console.error);
