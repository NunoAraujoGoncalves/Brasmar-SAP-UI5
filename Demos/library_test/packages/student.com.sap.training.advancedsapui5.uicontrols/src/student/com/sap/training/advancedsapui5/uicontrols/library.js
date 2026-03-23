/*!
 * ${copyright}
 */

/**
 * Initialization Code and shared classes of library student.com.sap.training.advancedsapui5.uicontrols.
 */
sap.ui.define([
	"sap/ui/core/library"
], function () {
	"use strict";

	// delegate further initialization of this library to the Core
	// Hint: sap.ui.getCore() must still be used to support preload with sync bootstrap!
	sap.ui.getCore().initLibrary({
		name: "student.com.sap.training.advancedsapui5.uicontrols",
		version: "${version}",
		dependencies: [ // keep in sync with the ui5.yaml and .library files
			"sap.ui.core"
		],
		types: [
			"student.com.sap.training.advancedsapui5.uicontrols.ExampleColor",
			"student.com.sap.training.advancedsapui5.uicontrols.PlaneInfo",
			"student.com.sap.training.advancedsapui5.uicontrols.HoverButton",
			"student.com.sap.training.advancedsapui5.uicontrols.PlaneInfoRenderer"
		],
		interfaces: [],
		controls: [
			"student.com.sap.training.advancedsapui5.uicontrols.Example"
		],
		elements: [],
		noLibraryCSS: false // if no CSS is provided, you can disable the library.css load here
	});

	/**
	 * Some description about <code>uicontrols</code>
	 *
	 * @namespace
	 * @name student.com.sap.training.advancedsapui5.uicontrols
	 * @author speeddragon2
	 * @version ${version}
	 * @public
	 */
	var thisLib = student.com.sap.training.advancedsapui5.uicontrols;

	/**
	 * Semantic Colors of the <code>student.com.sap.training.advancedsapui5.uicontrols.Example</code>.
	 *
	 * @enum {string}
	 * @public
	 */
	thisLib.ExampleColor = {

		/**
		 * Default color (brand color)
		 * @public
		 */
		Default: "Default",

		/**
		 * Highlight color
		 * @public
		 */
		Highlight: "Highlight"

	};

	return thisLib;

});
