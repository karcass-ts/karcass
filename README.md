# karcass

CLI tool for creating skeletons of different types of applications from templates.

The default template is a backend application's skeleton based on Express.js and TypeScript.

## Usage

To create an application based on default template, use this command:

```
npx karcass create sample
```

Where `sample` is the name of the project and directory where the project will be placed.

To use a different template you should pass gitlab url to that template as the last command argument. For example:

```
npx karcass create sample https://github.com/karcass-ts/default-template
```
