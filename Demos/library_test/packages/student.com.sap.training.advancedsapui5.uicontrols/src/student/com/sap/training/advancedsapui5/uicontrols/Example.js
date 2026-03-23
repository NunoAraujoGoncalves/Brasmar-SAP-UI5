/*!
 * ${copyright}
 */

// Provides control student.com.sap.training.advancedsapui5.uicontrols.Example.
sap.ui.define([
	"./library", 
	"sap/ui/core/Control", 
	"./ExampleRenderer"
], function (library, Control, ExampleRenderer) {
	"use strict";

	// refer to library types
	var ExampleColor = library.ExampleColor;

	/**
	 * Constructor for a new <code>student.com.sap.training.advancedsapui5.uicontrols.Example</code> control.
	 *
	 * @param {string} [sId] id for the new control, generated automatically if no id is given
	 * @param {object} [mSettings] initial settings for the new control
	 *
	 * @class
	 * Some class description goes here.
	 * @extends sap.ui.core.Control
	 *
	 * @author speeddragon2
	 * @version ${version}
	 *
	 * @constructor
	 * @public
	 * @alias student.com.sap.training.advancedsapui5.uicontrols.Example
	 */
	var Example = Control.extend("student.com.sap.training.advancedsapui5.uicontrols.Example", /** @lends student.com.sap.training.advancedsapui5.uicontrols.Example.prototype */ {
		metadata: {
			library: "student.com.sap.training.advancedsapui5.uicontrols",
			properties: {
				/**
				 * The text to display.
				 */
				text: {
					type: "string",
					group: "Data",
					defaultValue: null
				},
				/**
				 * The color to use (default to "Default" color).
				 */
				color: {
					type: "student.com.sap.training.advancedsapui5.uicontrols.ExampleColor",
					group: "Appearance",
					defaultValue: ExampleColor.Default
				}
			},
			events: {
				/**
				 * Event is fired when the user clicks the control.
				 */
				press: {}
			}
		},
		renderer: ExampleRenderer,
    onclick: function() {
      this.firePress();
    }
	});
	return Example;

});
