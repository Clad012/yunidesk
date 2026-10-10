// Dev only: Hermes has no Web Crypto, which signUserToken needs. Must load before anything signs.
import "./src/dev-crypto-polyfill";
import { registerRootComponent } from "expo";
import { App } from "./App";

registerRootComponent(App);
