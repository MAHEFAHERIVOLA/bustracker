import {
  c,
  l
} from "./chunk-6BO62SYH.js";
import {
  t
} from "./chunk-GJTGXAKU.js";
import {
  H,
  P
} from "./chunk-DOQ6QVJ4.js";
import {
  __async
} from "./chunk-3OV72XIM.js";

// node_modules/@ionic/core/components/p-Ck0lEczL.js
var n = () => {
  const n2 = window;
  n2.addEventListener("statusTap", () => {
    H(() => {
      const o = document.elementFromPoint(n2.innerWidth / 2, n2.innerHeight / 2);
      if (!o) return;
      const i = l(o);
      i && new Promise((o2) => t(i, o2)).then(() => {
        P(() => __async(null, null, function* () {
          i.style.setProperty("--overflow", "hidden"), yield c(i, 300), i.style.removeProperty("--overflow");
        }));
      });
    });
  });
};
export {
  n as startStatusTap
};
/*! Bundled license information:

@ionic/core/components/p-Ck0lEczL.js:
  (*!
   * (C) Ionic http://ionicframework.com - MIT License
   *)
*/
//# sourceMappingURL=p-Ck0lEczL-YXZNELUM.js.map
