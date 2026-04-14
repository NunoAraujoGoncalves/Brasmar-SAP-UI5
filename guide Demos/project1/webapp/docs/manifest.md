# Manifest Meaning and GuideLines

## SAP app
- id:
    1. Tecnical ID of the application, which was assigned when the project was generated.
    2. This ID must be unique when it's deployed to the SAP system and is used throughout the entire application
    3. If must be changed later, it must be changed not only here, but in every place(Conponent.js, views, controllers, etc.) 
    throughout the entire application.
- type:
    1. It's where the component is defined.
    2. Possible values are: application, library or card.
- title:
    1. Title of application, displayed at the top of the browser tab.
    2. There are aloso subtitles and description
    3. Don't enter text directly, use instead double curly brackets {{}} to refer to a key in i18n
- dataSources:
    1. Where we maintain OData and Representation State Transfer (REST) services
    2. Due to security restrictions, we use relative URLs to the respective services

 ## SAP ui   
- fullWidth:
    1. Can be used if the application is to run later in SAP Fiori launchpad and we want it to always take up
    the full witdh. Otherwise, the application will have a responsive margin on the left and rigth, as far as
    the device width allows.

 ## SAP ui5   
- felxEnabled:
    1. true or false property.
    2. Determines wether the app is enabled for adaptation via the SAPUI5 flexibility.
    3. Basically means if other developers can use this project as a basis for adaptation projects and key users
    will be able to extend this project using key user adaptation
- dependecies.minUi5Version:
    1. Indicates the minimum SAPUI5 version of the libraries that must be available on a server.
    2. Should be the same as the SAPUI5 version on the server (or case is 1.120.23 (202411061204))
 - dependecies.libs:
    1. SAPUi5 libraries that should definitely be loaded eagerly be the framework when the application is started.
    2. You can also use other libs in the application, thich are then subjected to lazy loading.
- models:
    1. Models used that are part of the MVC concept are globally defined here.
    2. These can be OData, JSON, XMl or resource models, which always have the same function but provide the data
    in a different format and can communicate with remote data sources depending on their definition.
- routing:
    1. Defines the naviagiton part of the views.
- rootView:
    1. Every UI component has a root view, which is the first view that opens.
    2. Inside it's either a full-screen application or a container that provides navigation.            
