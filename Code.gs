/**
 * Backup do Controle de Campo — recebe um "retrato" completo dos dados
 * e escreve em abas da planilha, substituindo o conteúdo de cada aba.
 *
 * Também recebe as fotos do carregamento e guarda no Google Drive (pasta
 * "ControleCoco_Fotos", organizada em subpastas por carga), sem precisar
 * de tela de login pro pessoal do campo — o script roda com a conta Google
 * de quem publicou ele.
 */

var PASTA_FOTOS_NOME = "ControleCoco_Fotos";

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    if (payload.action === "uploadFoto") return uploadFoto(payload);
    if (payload.action === "excluirFoto") return excluirFoto(payload);

    // sem "action" definido = comportamento de sempre, o backup de planilha
    return backupPlanilha(payload);
  } catch (err) {
    return respond({ ok: false, erro: String(err) });
  }
}

function backupPlanilha(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(payload.sheets || {}).forEach(function (nomeAba) {
    var linhas = payload.sheets[nomeAba];
    var aba = ss.getSheetByName(nomeAba);
    if (!aba) aba = ss.insertSheet(nomeAba);
    aba.clearContents();

    if (!linhas || linhas.length === 0) {
      aba.getRange(1, 1).setValue("(sem dados ainda)");
      return;
    }

    var colunas = Object.keys(linhas[0]);
    aba.getRange(1, 1, 1, colunas.length).setValues([colunas]);

    var dados = linhas.map(function (linha) {
      return colunas.map(function (c) {
        var v = linha[c];
        return (v === null || v === undefined) ? "" : v;
      });
    });
    aba.getRange(2, 1, dados.length, colunas.length).setValues(dados);
    aba.autoResizeColumns(1, colunas.length);
  });

  var agora = new Date();
  var abaInfo = ss.getSheetByName("_info") || ss.insertSheet("_info");
  abaInfo.getRange(1, 1).setValue("Último backup recebido:");
  abaInfo.getRange(1, 2).setValue(agora);

  return respond({ ok: true, recebidoEm: agora });
}

// Acha (ou cria) a pasta raiz de fotos, e dentro dela a subpasta da carga específica —
// assim as fotos ficam organizadas por carga, fácil de achar direto no Drive também
// se um dia precisar ver na mão.
function pastaDaCarga(cargaId) {
  var raiz = DriveApp.getRootFolder();
  var pastasRaiz = raiz.getFoldersByName(PASTA_FOTOS_NOME);
  var pastaFotos = pastasRaiz.hasNext() ? pastasRaiz.next() : raiz.createFolder(PASTA_FOTOS_NOME);

  var nomeSubpasta = "carga_" + cargaId;
  var pastasCarga = pastaFotos.getFoldersByName(nomeSubpasta);
  return pastasCarga.hasNext() ? pastasCarga.next() : pastaFotos.createFolder(nomeSubpasta);
}

function uploadFoto(payload) {
  var cargaId = payload.cargaId;
  var base64 = payload.base64; // só os bytes, sem o prefixo "data:image/jpeg;base64,"
  var nomeArquivo = payload.nomeArquivo || ("foto_" + Date.now() + ".jpg");
  var mimeType = payload.mimeType || "image/jpeg";

  if (!cargaId || !base64) return respond({ ok: false, erro: "faltou cargaId ou base64" });

  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mimeType, nomeArquivo);

  var pasta = pastaDaCarga(cargaId);
  var arquivo = pasta.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var fileId = arquivo.getId();
  var url = "https://lh3.googleusercontent.com/d/" + fileId + "=s1600";

  return respond({ ok: true, fileId: fileId, url: url });
}

function excluirFoto(payload) {
  var fileId = payload.fileId;
  if (!fileId) return respond({ ok: false, erro: "faltou fileId" });
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    // se o arquivo já não existir no Drive, não é motivo pra dar erro pro app
  }
  return respond({ ok: true });
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return respond({ ok: true, msg: "Backup endpoint ativo. Use POST." });
}
