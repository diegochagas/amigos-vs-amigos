// All visible strings, English and Portuguese.
const STRINGS = {
  en: {
    title: "AMIGOS VS. AMIGOS", subtitle: "CLASH OF FRIENDS", start: "PRESS START", startTouch: "TAP TO START",
    choose: "CHOOSE YOUR FIGHTER", confirm: "A = OK", stage: "STAGE", final: "FINAL STAGE", shadow: "SHADOW",
    round: "ROUND", finalRound: "FINAL ROUND", fight: "FIGHT!", ko: "K.O.", timeup: "TIME UP", draw: "DRAW",
    wins: "WINS", youWin: "YOU WIN", youLose: "YOU LOSE", perfect: "PERFECT", hits: "HITS", max: "MAX",
    continue: "CONTINUE?", gameOver: "GAME OVER", congrats: "CONGRATULATIONS!", champion: "IS THE CHAMPION",
    thanks: "THANKS FOR PLAYING", paused: "PAUSED", resume: "Resume", soundOn: "Sound: on", soundOff: "Sound: off",
    quit: "Quit to title", fullscreen: "Full screen", menu: "Menu", lang: "PT", cpu: "CPU",
    help: "D-pad: move, jump, crouch · hold back to block · A punch · B kick · A+B special · A+B with MAX = hyper",
    helpKeys: "Keys: arrows + Z (A) X (B) · Enter start · Esc pause",
  },
  pt: {
    title: "AMIGOS VS. AMIGOS", subtitle: "CHOQUE DE AMIGOS", start: "APERTE START", startTouch: "TOQUE PARA COMEÇAR",
    choose: "ESCOLHA SEU LUTADOR", confirm: "A = OK", stage: "FASE", final: "FASE FINAL", shadow: "SOMBRA",
    round: "ROUND", finalRound: "ROUND FINAL", fight: "LUTEM!", ko: "K.O.", timeup: "TEMPO ESGOTADO", draw: "EMPATE",
    wins: "VENCE", youWin: "VOCÊ VENCEU", youLose: "VOCÊ PERDEU", perfect: "PERFEITO", hits: "GOLPES", max: "MAX",
    continue: "CONTINUAR?", gameOver: "FIM DE JOGO", congrats: "PARABÉNS!", champion: "É O CAMPEÃO",
    thanks: "OBRIGADO POR JOGAR", paused: "PAUSADO", resume: "Continuar", soundOn: "Som: ligado", soundOff: "Som: desligado",
    quit: "Sair para o título", fullscreen: "Tela cheia", menu: "Menu", lang: "EN", cpu: "CPU",
    help: "Direcional: andar, pular, agachar · segure para trás para defender · A soco · B chute · A+B especial · A+B com MAX = hyper",
    helpKeys: "Teclas: setas + Z (A) X (B) · Enter start · Esc pausa",
  },
};
export const LANGS = Object.keys(STRINGS);
export const keysOf = (lang) => Object.keys(STRINGS[lang]);

export function pickLang(param, stored, browser) {
  for (const v of [param, stored]) if (LANGS.includes(v)) return v;
  return String(browser || "").toLowerCase().startsWith("pt") ? "pt" : "en";
}

let lang = "en";
export const getLang = () => lang;
export function setLang(l) {
  if (LANGS.includes(l)) lang = l;
}
export const t = (key) => STRINGS[lang][key] ?? key;
