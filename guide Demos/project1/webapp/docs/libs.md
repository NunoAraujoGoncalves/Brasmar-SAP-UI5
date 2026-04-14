# SAP Common Libraries

## sap.base
Provides general functionality of the framework such as internationalization, logging and security

### Components
1. sap.base.assert
    - basic assert methods to check if a value meets a certain criteria or condition
    - can also be used for testing purposes

2.  sap.base.i18n.ResourceBundle
    - Stores text is seprate files based on language
    - You can use this to access these files and display text based on the user's language
    - There is a create method where we provide the base URL of the resource bundle file and optionally the user's preferred language.
    - If the specific language file is not found the bundle looks for alternatives in a specific order:
        1. Locale without region code
        2. Fallback language (defaults to English)
        3. Base URL file (the original i18n file without any language info)

3. sap.base.Logging
    - Helps monitoring the application's behavior by creating log entries
    - We can control which log messages are recorded by setting the minimum level using `setLevel`
    - By default, optimized builds only record errros, while debug builds show all messages 

4. sap.base.security: sap,ui,security
    - Enconding of CSS, JavaScript, URLs, URL parameters and XML

5. sap.base.util
    - Methods for working with arrays, cloning data, loopping over arrays, generating unique IDs, etc ...


## sap.ui
Foundation library that provides the basic bulding blocks of all SAPUI5 applications, including models, views, controllers and routing

### sap.ui.core
Core Functionalities of SAPUI5

1. sap.ui.core.Control, sap.ui.core.Element
    - Main concepts to build UI elements

2. sap.ui.core.Component
    - Base class in SAPUI5 for defining reusable UI components

3. sap.ui.core.BusyIndicator
    - Can be used to indicate that is work is currently done or something is being processed
    - It blocks the UI part, disabling user's interactions with it

4. sap.ui.core.dnd
    - Bundle for the drag and drop technology in SAPUI5.

5. sap.ui.core.EventBus
    - Observer pattern to be used to trigger events and react to these events throughout the application.
    - Its advised to create custom event bus instead of using this    

6. sap.ui.core.Fragment
    - Component for creation of reusable XML snippets 

7. sap.ui.core.Icon
    - Displays icons from the SAP Fiori icon pool

8. sap.ui.core.Item
    - Default implementation of an item that can be used in dropdowns or lists

9. sap.ui.core.Routing
    - Implementation of the routing concept
    - Instance of this class is normally created via its definition in the *manifest.json* and the instantiate routing method in *Component.js*        

10. sap.ui.core.Title
    - Used to render enphasized text that should serve as a title

### sap.ui.Device
This API offers insights into the user's browser and devide, as well as cross-platform support for events such as media queries, orientation changes and resizing.
It operates independently of the rest of the SAPUI5 framework, enabling its preloading for dynamic SAPUI5 bootstrapping based on devide or browser capabilities.
The data of the Device API is normally put into a global named JSONModel during the instantiation of *Component.js* 

### sap.ui.layout
Bundles the different layout options SAPUI5 comes shipped with.
This includes horizontal and vertical box layouts, different grids, responsive layouts, etc.

### sap.ui.model
Diferent models to hold and managing data.

1. sap.ui.model.json.JSONModel
    - Client-side model stores data in JSON

2. sap.ui.model.odata.v2.ODataModel
    - Server-side model for integrating OData Version 2 services

3. sap.ui.model.odata.v4.ODataModel
    - Server-side model for integrating OData Version 4 services

4. sap.ui.model.resource.ResourceModel
    - Resource data that gets bundle like the internationalization files of the application

5. sap.ui.model.Filter
    - Creates filtes for bindings and handles their logic and combination

6. sap.ui.model.FilterOperator
    - This enum provides valid filter operations

7. sap.ui.model.binding
    - Base class for binding information

8. sap.ui.model.Context
    - Holds context for all binding information

9. sap.ui.model.PropertyBinding
    - This is the binding between one property of an element and one property of a model

10. sap.ui.model.ListBinding
    - This is the binding between a controls aggregation and a list of model data

11. sap.ui.model.TreeBinding
    - This is like the ListBinding but for hierarchical data.

12. sap.ui.model.Sorter
    - This class is responsible for sorting bindings.

13. sap.ui.richtexteditor
    - The control for advanced input of foramatted text
    - It uses third-party components and might therefore run into certain restrictions when used in specific scenarios.
    - It's note recomended to do direct binding with this, and instead new values should always be set via its dedicated setter
    methods and retrieved via its getter methods.
    - Same thing with changing editable properties, it may cause rendering issues. To solve this, new instances of the control
    should be created whith the correct editable value provided instead of changing it during runtime via the setter method.

14. sap.ui.table
    - Table control, aslo known as the grid table with horizontal and vertical scrolling.


## sap.m
Specifically designed for mobile devices and tablets, providing touch-optimized controls and responsive layouts.

1. sap.m.App
    - This control is the base of a SAPUI5 application and serves as a single page
    container and a navigation container.

2. sap.m.Avatar
    - The avatar is a round image or text used for displaying users.

3. sap.m.Breadcrumbs
    - The breadcrumbs provide easy navigation functionality by displaying the previous navigation steps as clickable links.

4. sap.m.Button
    - The sap.m.Button is the main control for displaying buttons that users can interact with. 
    - It supports different button types for different scenarios.

5. sap.m.Carousel
    - The carousel displays a list of items that can be shuffled from left to right. It can be used to always bring one item into the spotlight.

6. sap.m.CheckBox
    - This displays a checkbox that can be selected or deselected.

7. sap.m.ComboBox
    - The sap.m.ComboBox can be used to display a dropdown that includes between 13 and 200 items. 
    - It supports search completion and adding new dropdown items on the fly.

8. sap.m.DatePicker
    - This control offers the input of dates by providing a calendar popover when interacting with it.

9. sap.m.DateTimePicker
    - The DateTimePicker adds time to the DatePicker control.

10. sap.m.Dialog
    - The sap.m.Dialog control provides a modular dialog that can be opened dynamically. 
    - This can be used when you want to interrupt the user’s current interaction and display data that should be processed now.

11. sap.m.FlexBox
    - This layout control enables you to use the flexible box layout of CSS in SAPUI5.

12. sap.m.HBox
    - The sap.m.HBox layout control allows you to align content horizontally.

13. sap.m.IconTabBar
    - With the IconTabBar, you can cluster content into different tabs that can be selected via a toolbar, displaying icons for each tab. 
    - This is great for structuring content and adding visual appeal to them.

14. sap.m.Image
    - This is the general implementation with which you can add images to your apps.

15. sap.m.Input
    - The sap.m.Input control allows you to input data. It can be enhanced with placeholder texts to provide information on what users need to input there.

16. sap.m.Link
    - With the sap.m.Link control, you can add hyperlinks to your apps. This is the pendant to the HTML anchor tag.

17. sap.m.List
    - The list control allows you to display items in a structured list, supporting performance techniques such as lazy loading. 
    - You can use the list with different list item types for displaying the list data in different ways such as
    custom layouts, standard layouts, and so on.

18. sap.m.Menu
    - The sap.m.Menu control makes creating menus possible that can then be structured into submenus. 
    - This is for clustering actions into one place.

19. sap.m.MessageBox
    - With the sap.m.MessageBox control, you can display different predefined severities of messages to users. 
    - This will open a dialog that depending on the severity shows a different color and icon scheme.

20. sap.m.MessageStrip
    - The MessageStrip shows messages directly in the UI, also coming with predefined severities.

21. sap.m.MessageToast
    - With the MessageToast control you’re able to display messages that pop up and are automatically set invisible after a few seconds. 
    - This doesn’t interrupt the users interaction flow as hard as a MessageBox, for example.

22. sap.m.OverflowToolbar
    - The OverflowToolbar can be used as a responsive toolbar. 
    - When the space becomes smaller, otherwise impacted items in the toolbar will be shifted into a menu in the toolbar.
    - This allows you to tidy up the UI in responsive scenarios.

23. sap.m.Page
    - The sap.m.Page control gives you a general layout consisting of a header, content area, and footer area, and it takes up 100% of the screen.

24. sap.m.PDFViewer
    - With the PDFViewer, you can display files with an application/pdf MIME type in your application.

25. sap.m.PlanningCalendar
    - The PlanningCalendar works as a calendar, showing appointments for different entities in rows. 
    - These appointments can be visually enhanced. 
    - The calendar itself supports different views and time intervals such as weekly or monthly views.

26. sap.m.Popover
    - The popover can be used to display additional information opened by a button click, for example.

27. sap.m.RadioButton
    - Radio buttons work like checkboxes that are grouped so that only one can be selected.

28. sap.m.RangeSlider
    - A RangeSlider enables users to select a numeric value based on an interval by using a slider.

29. sap.m.SegmentedButton
    - With the SegmentedButton, you can add multiple buttons together to give them the same context. 
    - This is often done to display filters for tables such as “own” and “others”.

30. sap.m.Select
    - The select works similarly to the ComboBox but should be used for fewer entries.

31. sap.m.StepInput
    - The StepInput enables numerical input that can be incremented or decremented by predefined steps.

32. sap.m.Switch
    - With the switch control, you can add a toggle control for setting true/false values.

33. sap.m.Table
    - This table control, also called responsive table, is the main table type that should be used to display tabular data in responsive scenarios. 
    - It supports line breaking, device-specific visibility of columns, and grouping table data.

34. sap.m.Text
    - This is the main control for displaying texts in your UI.

35. sap.m.TextArea
    - This works like the input control, but adds multiline support instead of a single line of data.

36. sap.m.VBox
    - The VBox control places its content vertically.

37. sap.m.Wizard
    - The wizard is a great control for taking a user step-by-step through a process such as the creation of new data. 
    - It should include at least three steps, which can be activated individually.

## sap.ushell
Bundles the access to services of the SAP Fiori launchpad

## sap.uxap
Has all controls necessary for building SAP Fiori object pages.

## sap.f
Includes special controls for SAPUI5 development that arent normally found in other frameworks.

1. sap.f.Card
    - A card is a container with predefined header and content, as well as a predefined visual style. 
    - It can be used with a list, table, contact information, charts, and so on.

2. sap.f.DynamicPage
    - The dynamic page is the base for the object page. It provides a title, dynamic header that can be expanded or collapsed, and a content area. 
    - If you want to have this behavior but don’t need all the features from the object page, use the dynamic page. 
     It has significantly fewer dependencies and less rendering time than an object page.

3. sap.f.FlexibleColumnLayout
    - This control functions similarly to sap.m.SplitContainer, but with the key distinction of supporting three columns (begin, mid, and end) instead of the
    two typically found in sap.m.SplitContainer (master and detail). 
    - The width of each of these three columns can be dynamically adjusted. 
    - The control offers a variety of possible layouts, which can be modified programmatically via the control’s API or interactively by the user. 
    - Draggable column separators enable users to customize column widths within the current layout. 
    - Moreover, dragging a separator past a predefined breakpoint can trigger a transition to a different layout.

4. sap.f.GridContainer
    - The grid container is a layout control that places its content in a grid. 
    - This grid is sectioned into rows and columns and can vary in CSS size. 
    - Its content then gets the information on how many columns and rows it should occupy.

5. sap.f.GridList
    - The grid list works similarly to the grid container but should be used for displaying its content in the same size. 
    - It can also use different grid layouts. 

6. sap.f.ProductSwitch
    - The product switch displays a popover that displays a list of items. 
    - These items represent different apps, navigation targets, or other items.