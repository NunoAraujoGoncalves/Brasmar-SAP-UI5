# Controllers 

## Lifecycle Methods of all controllers
There are four lifecycle methods that are implicity called by the framework.
These methods can be predefined in the template, but they don't have to be. In any case, you can insert
or remove these methods as you like, as they will always be found by the framework due to their identical names. The
following four methods can be used in any controller:

1. onInit
    - This method is automatically run by the framework when the view is initialized for the first time together with the controller.

2. onBeforeRendering
    - This method is called before the view starts rendering the UI components.

3. onAfterRendering
    - This method is called when the rendering has been completed

4. onExit
    - This method is automatically run by the framework when the view is destroyed.  
    - This is the case when the view or component itself is destroyed during the operation, either by triggering the destroy()
    method in the business logic or by the app simply being exited bt the user.


All of this methods are only called once during the livecycle of a view. Business logic that needs to be called repeatedly
shouldn't be placed in these functions. For this, a suitable listener must be found.

### Important Shiit 
## View Manipulation
Thanks to the 1:1 relationship between controller and view, we can acess the view instance in each method with:
-   this.getView()

We can get a specifyc UI Component with the byID(sId) method:
-   this.getView().byId("inputFirstname")  