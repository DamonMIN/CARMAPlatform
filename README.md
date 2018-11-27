# CARMA
![CARMA Arch](docs/image/CARMA_web_banner_18oct18_5.png)

**Cooperative Automated Research Mobility Applications (CARMA)**, CARMA is a reusable, extensible platform for controlling SAE level 1 connected, automated vehicles (CAVs). It provides a rich, generic API for third party plugins that implement vehicle guidance algorithms. It is written in Java and C++ and runs in a Robot Operating System (ROS) environment. It offers a rich application programming interface (API) for third party authors to develop guidance plugins that can plan vehicle trajectories under certain conditions. The platform can be reused on a variety of properly equipped vehicles.

## What Is CARMA
![CARMA Arch](docs/image/CARMA2_Architecture.png)

Managing automated vehicle motion involves three aspects. The first is **navigation, also know as localization**, which is the act of determining where the vehicle currently is with respect to the earth and with respect to the desired path of travel (its planned route). The second is **guidance, also know as path planning**, which includes the processes of determining how the vehicle is to move from its current location to its destination. The destination and route will be handed to the guidance algorithms, and they then determine how the vehicle’s motion needs to be adjusted at any time in order to follow the route. The third aspect of automated vehicle motion is **control**, which covers the actuation of the vehicle’s physical devices to induce changes in motion (for land vehicles these are typically causing the wheels to rotate faster or slower and turning the steering wheel). Therefore, the navigation solution becomes an input to the guidance function, and the guidance solution becomes an input to the control function. As the vehicle moves, obviously its location changes so that the navigation function constantly needs to update its solution and the cycle iterates as quickly as necessary to produce a smooth and accurate vehicle motion. The rate of iteration is largely determined by the expected speed of the vehicle.

CARMA provides the navigation and guidance functions for its host vehicle, as well as some of the control functions.  It depends on low level controller hardware to provide the rest of the control function.  The current version of CARMA is limited to longitudinal (speed) control, so a human operator needs to control the steering wheel.  The next major update to CARMA will include lateral (steering) control as well, for full SAE level 2 autonomy.

## Documentation

![CARMA Demo](docs/image/CARMA2_Platooning_from_Office.jpg)

## System Specifications
The platform's performance requirements are specified to conform the following performance requirements. Performance requirements shall only be applicable to the platform being developed, including Android tablets and GUIs; computers, software, positioning units, and processors that are not part of the OEM vehicle. The functional requirements are specified to confirm the following functional requirements.  Functional requirements shall be applicable to the platform being developed, including the vehicle's control, MAP and SPAT messages, etc.
[CAV Platform Requirements](https://usdot-carma.atlassian.net/wiki/spaces/CAR/pages/56786945/Platform+Requirements+Document?preview=/56786945/56852481/CAV%20Platform%20Requirements.docx)

## Release Notes
The current version release of the CARMA software platform. [CARMA Release Notes](<docs/Release_notes.md>)

## Architecture Guide
The documentation describes the architecture of a single CARMA vehicle.  There may be several of these vehicles operating in concert, communicating with each other via DSRC or cellular means.  They can also communicate with roadside infrastructure using DSRC or cellular.  The communication among software components within a single vehicle, however, is mostly done via the Robot Operating System (ROS) framework.  There are no ROS communications between neighboring vehicles. [CARMA Architecture Guide](https://usdot-carma.atlassian.net/wiki/spaces/CAR/pages/23330913/CARMA+Project+Documentation?preview=/23330913/29589549/CARMA%20Platform%20Architecture.docx)

## Detailed Design Documents
Please see the Detail Design document page for detailed design specification for CARMA and other additional information.
[Detail Design Page](Detail_Design.md)

## Developers Guide 
This guide describes the overall approach to develop a plug-in. [Developers Guide](https://usdot-carma.atlassian.net/wiki/spaces/CAR/pages/23330913/CARMA+Project+Documentation?preview=/23330913/29556796/CARMA%202.7%20Developers%20Guide.docx)

## Users Guide
The User Guide describes the complete functionality specific to the Cadillac SRX. Some vehicle IPs/power procedures may change when using other vehicles. [CARMA User Guide](https://usdot-carma.atlassian.net/wiki/spaces/CAR/pages/23330913/CARMA+Project+Documentation?preview=/23330913/29392940/CARMA%202.7%20USER%20GUIDE.docx)

## Administrator Guide
This guide describes the vehicle and developer PC configuration, build, deployment and testing steps necessary to install and run the CARMA platform. [Administrator Guide](https://usdot-carma.atlassian.net/wiki/spaces/CAR/pages/23330913/CARMA+Project+Documentation?preview=/23330913/29196388/CARMA%20Administrator%20Guide.docx)

## Contribution
Welcome to the CARMA contributing guide. Please read this guide to learn about our development process, how to propose pull requests and improvements, and how to build and test your changes to this project. [CARMA Contributing Guide](Contributing.md) 



## License
By contributing to the Federal Highway Administration (FHWA) Connected Automated Research Mobility Applications (CARMA), you agree that your contributions will be licensed under its Apache License 2.0 license. [CARMA License](<docs/License.md>) 

## Contact
Please click on the CARMA logo below to vist the Federal Highway Adminstration(FHWA) CARMA website.

[![CARMA Image](docs/image/CARMA_icon.png)](https://highways.dot.gov/research/research-programs/operations/CARMA)
