const url = "https://script.google.com/macros/s/AKfycbzg38bHL9qIICg2DFeCk2YILsvtPL0QXd24kf1fZako2poVZthtj05K_a00Ee7bN0dK/exec";

async function testLatency() {
  console.log("Testing verifyTicket (dummy token)...");
  let start = Date.now();
  let res = await fetch(`${url}?action=verifyTicket&token=dummy_token_123&_t=${Date.now()}`);
  let text = await res.text();
  console.log(`Verify time: ${Date.now() - start}ms`);
  console.log(`Response: ${text.substring(0, 100)}`);

  console.log("\nTesting checkInTicket (dummy token)...");
  start = Date.now();
  res = await fetch(`${url}?action=checkInTicket&token=dummy_token_123&_t=${Date.now()}`);
  text = await res.text();
  console.log(`CheckIn time: ${Date.now() - start}ms`);
  console.log(`Response: ${text.substring(0, 100)}`);
}

testLatency();
