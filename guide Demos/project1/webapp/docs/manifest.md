# Manifest Meaning and GuideLines

## SAP app
1. id:
    - Tecnical ID of the application, which was assigned when the project was generated.
    - This ID must be unique when it's deployed to the SAP system and is used throughout the entire application
    - If must be changed later, it must be changed not only here, but in every place(Conponent.js, views, controllers, etc.) 
    throughout the entire application.
2. type:
    - It's where the component is defined.
    - Possible values are: application, library or card.
3. title:
    - Title of application, displayed at the top of the browser tab.
    - There are aloso subtitles and description
    - Don't enter text directly, use instead double curly brackets {{}} to refer to a key in i18n
4. dataSources:
    - Where we maintain OData and Representation State Transfer (REST) services
    - Due to security restrictions, we use relative URLs to the respective services

 ## SAP ui   
1. fullWidth:
    - Can be used if the application is to run later in SAP Fiori launchpad and we want it to always take up
    the full witdh. Otherwise, the application will have a responsive margin on the left and rigth, as far as
    the device width allows.

 ## SAP ui5   
1. felxEnabled:
    - true or false property.
    - Determines wether the app is enabled for adaptation via the SAPUI5 flexibility.
    - Basically means if other developers can use this project as a basis for adaptation projects and key users
    will be able to extend this project using key user adaptation
2. dependecies.minUi5Version:
    - Indicates the minimum SAPUI5 version of the libraries that must be available on a server.
    - Should be the same as the SAPUI5 version on the server (or case is 1.120.23 (202411061204))
3. dependecies.libs:
    - SAPUi5 libraries that should definitely be loaded eagerly be the framework when the application is started.
    - You can also use other libs in the application, thich are then subjected to lazy loading.
4. models:
    - Models used that are part of the MVC concept are globally defined here.
    - These can be OData, JSON, XMl or resource models, which always have the same function but provide the data
    in a different format and can communicate with remote data sources depending on their definition.
5. routing:
    - Defines the naviagiton part of the views.
6. rootView:
    - Every UI component has a root view, which is the first view that opens.
    - Inside it's either a full-screen application or a container that provides navigation.            
