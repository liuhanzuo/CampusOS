import React from "react";
import {AppRegistry, Text} from "react-native";
import {name} from "./app.json";
import {App} from "./src/App";

const oldRender = Text.render;
Text.render = function (props, ...extraArgs) {
	return oldRender.call(this, {...props, textBreakStrategy: "simple"}, ...extraArgs);
};

AppRegistry.registerComponent(name, () => App);
