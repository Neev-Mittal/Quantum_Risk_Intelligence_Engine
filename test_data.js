const fs = require('fs');
const path = require('path');

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/PNB', f), 'utf8'));

async function test() {
  const cbom = load('cbom.json');
  const enriched = load('enriched_cbom.json');
  const subdomains = load('subdomains.json');

  const assets = enriched.records || cbom.records || [];
  const subs = subdomains.subdomains || [];

  console.log(`Loaded ${assets.length} assets and ${subs.length} subdomains`);

  // --- getDashboardData simulation ---
  let webApps = 0, apis = 0, servers = 0, expiring = 0, highRisk = 0;
  let typeCounts = { 'Web Apps': 0, 'APIs': 0, 'Servers': 0, 'Load Balancers': 0, 'Other': 0 };
  let riskCounts = { 'Critical': 0, 'High': 0, 'Medium': 0, 'Low': 0 };
  let certCounts = { '0-30 Days': 0, '30-60 Days': 0, '60-90 Days': 0, '>90 Days': 0 };
  let ipCounts = { v4: 0, v6: 0 };

  // Calculate Subdomains / Type info
  subs.forEach(s => {
    let type = (s.asset_type || '').toLowerCase();
    if (type.includes('api')) { apis++; typeCounts['APIs']++; }
    else if (type.includes('domain') || type.includes('web')) { webApps++; typeCounts['Web Apps']++; }
    else if (type.includes('server')) { servers++; typeCounts['Servers']++; }
    else { typeCounts['Other']++; }
    
    (s.ips || []).forEach(ip => {
      if (ip.includes(':')) ipCounts.v6++; else ipCounts.v4++;
    });
  });

  // Calculate Asset info
  assets.forEach(a => {
    let risk = a.Risk_Category || 'Low';
    if (riskCounts[risk] !== undefined) riskCounts[risk]++;
    if (risk === 'High' || risk === 'Critical') highRisk++;

    let certVal = a['Certificate Validity (Not Before/After)'];
    if (certVal && certVal['Not After']) {
      let days = (new Date(certVal['Not After']) - new Date()) / (1000 * 60 * 60 * 24);
      if (days < 0) { expiring++; } // already expired
      else if (days <= 30) { expiring++; certCounts['0-30 Days']++; }
      else if (days <= 60) { certCounts['30-60 Days']++; }
      else if (days <= 90) { certCounts['60-90 Days']++; }
      else { certCounts['>90 Days']++; }
    }
  });

  console.log('Dashboard Stats:');
  console.log({ total: subs.length, webApps, apis, servers, expiring, highRisk });
  console.log('Type:', typeCounts);
  console.log('Risk:', riskCounts);
  console.log('Certs:', certCounts);
  console.log('IPs:', ipCounts);

  // --- getAssetDiscoveryData simulation ---
  let domains = [], ssls = [], ipsArr = [], software = [];
  subs.forEach(s => {
    domains.push({
      detected: new Date(s.resolved_at_utc).toLocaleDateString(),
      domain: s.fqdn,
      registered: '-', registrar: '-',
      company: 'PNB'
    });
    (s.ips || []).forEach(ip => {
      ipsArr.push({
        detected: new Date(s.resolved_at_utc).toLocaleDateString(),
        ip,
        ports: '-', subnet: '-', asn: '-', netname: '-', location: '-', company: 'PNB'
      });
    });
  });
  
  assets.forEach(a => {
     let certVal = a['Certificate Validity (Not Before/After)'];
     if (a['Issuer CA']) {
       ssls.push({
         detected: '-',
         sha: a['Hash Algorithm'] || '-',
         validFrom: certVal ? certVal['Not Before'] : '-',
         common: a.Asset,
         company: 'PNB',
         authority: a['Issuer CA'].replace('CN=', '')
       });
     }
  });
  console.log(`Discovery: ${domains.length} domains, ${ssls.length} SSLs, ${ipsArr.length} IPs`);

}
test().catch(console.error);
