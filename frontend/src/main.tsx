import { captureGovReturn } from "./govCallbackReturn";

const returned = captureGovReturn();
void import("./bootstrap").then(({ mount }) => mount(returned));
