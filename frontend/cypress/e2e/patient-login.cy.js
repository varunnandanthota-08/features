describe('CareOS Patient Login', () => {

  it('logs a patient in successfully', () => {
    cy.visit('http://localhost:5173')

    cy.contains("I'm a Patient")
      .should('be.visible')
      .click()

    cy.url().should('include', '/role-selection?role=patient')

    cy.contains('Patient')
      .should('be.visible')
      .click()

    cy.get('#username')
      .should('be.visible')
      .and('be.enabled')
      .type('patient1')

    cy.get('#password')
      .should('be.visible')
      .and('be.enabled')
      .type('updated1')

    cy.get('button.auth-submit-btn')
      .should('be.visible')
      .and('be.enabled')
      .click()

    cy.contains('Welcome')
      .should('be.visible')

    cy.contains('Dashboard')
      .should('be.visible')
  })


  it('shows an error for invalid patient credentials', () => {
    cy.visit('http://localhost:5173')

    cy.contains("I'm a Patient")
      .should('be.visible')
      .click()

    cy.url().should('include', '/role-selection?role=patient')

    cy.contains('Patient')
      .should('be.visible')
      .click()

    cy.get('#username')
      .type('patient1')

    cy.get('#password')
      .type('wrong-password')

    cy.get('button.auth-submit-btn')
      .click()

    cy.contains('Invalid credentials')
      .should('be.visible')
  })

})